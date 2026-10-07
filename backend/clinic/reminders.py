"""
Avtomatik qabul eslatmalari (Telegram va SMS orqali).

Jadval qoidalari (Toshkent vaqti, UTC+5):
  1) Haftalik eslatma: Dam olish kuni (Yakshanba) soat 18:00 da kelasi haftadagi barcha qabullar uchun.
  2) 1 kun oldin eslatma: Qabuldan 1 kun oldin soat 18:00 da ("Ertaga soat {time} da sizni kutib qolamiz...").

Kanal:
  - Telegram (ulangan Telethon akkaunt orqali)
  - SMS (Eskiz / SMS-shlyuz orqali)

Bemor javobini tahlil qilish algoritmi (NLP Intent Parser):
  - Tasdiqlash ("Ha", "Boraman", "Kelaman", "Tasdiqlayman", "Да", "Буду", "Yes", ...) -> status='confirmed'
  - Kechikish ("Kechikaman", "15 minut kech qolaman", "Опоздаю", ...) -> status='late'
  - Kelmaslik/Bekor qilish ("Kela olmayman", "Bormayman", "Bekor qiling", "Не смогу", ...) -> status='no_show' (agar bugun) yoki 'cancelled'
  - Ko'chirish ("Boshqa vaqtga", "Ko'chiring", "Перенести", ...) -> status='unconfirmed' + adminga belgi
  - Noma'lum/boshqa gaplar -> statusga tegilmaydi, administrator ko'rib chiqishi uchun qoldiriladi.
"""
import os
import re
import json
import time
import threading
import datetime

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import telegram_auth
from . import sms_service
from .models import Appointment, Patient

_CFG_FILE = os.path.join(settings.BASE_DIR, 'reminders_config.json')
_SENT_FILE = os.path.join(settings.BASE_DIR, 'reminders_sent.json')
CLINIC_NAME = 'Dent Academy'

# Tashkent UTC+5 Timezone
try:
    import zoneinfo
    TASHKENT_TZ = zoneinfo.ZoneInfo("Asia/Tashkent")
except Exception:
    TASHKENT_TZ = datetime.timezone(datetime.timedelta(hours=5))

_DEFAULTS = {
    'enabled': True,
    'send_telegram': True,
    'send_sms': True,
    'day_before': True,
    'this_week': True,
    'hour_before': True,   # Qabuldan 1 soat oldin eslatma
    'schedule_hour': 18,  # Toshkent vaqti bilan kechki soat 18:00 da
    'lang': 'uz',
    'hour': {
        'uz': 'Assalomu alaykum, {name}! 1 soatdan so‘ng (soat {time} da) {clinic} klinikasida qabulingiz bor. Shifokor: {doctor}. Yo‘ldamisiz? Kela olmasangiz «Bekor» deb yozing.',
        'ru': 'Здравствуйте, {name}! Через 1 час (в {time}) у вас приём в клинике {clinic}. Врач: {doctor}. Вы уже в пути? Если не сможете — напишите «Отмена».',
        'en': 'Hello, {name}! In 1 hour (at {time}) you have an appointment at {clinic}. Doctor: {doctor}. Are you on your way? If not, reply "Cancel".',
    },
    'day': {
        'uz': 'Assalomu alaykum, {name}! Ertaga soat {time} da {clinic} klinikasida sizni kutib qolamiz. Kechikmasligingizni so‘rab qolamiz. Qabulga kela olasizmi? Shifokor: {doctor}.',
        'ru': 'Здравствуйте, {name}! Завтра в {time} мы ждём вас в клинике {clinic}. Убедительно просим не опаздывать. Вы сможете прийти на приём? Врач: {doctor}.',
        'en': 'Hello, {name}! Tomorrow at {time} we are looking forward to seeing you at {clinic}. Please arrive on time. Will you be able to attend? Doctor: {doctor}.',
    },
    'week': {
        'uz': 'Assalomu alaykum, {name}! Sizni kelgusi hafta ({date}, soat {time} da) {clinic} klinikasida qabulingiz borligini eslatib o‘tamiz. Kechikmasligingizni so‘rab qolamiz. Shifokor: {doctor}.',
        'ru': 'Здравствуйте, {name}! Напоминаем, что на следующей неделе ({date}, в {time}) у вас приём в клинике {clinic}. Врач: {doctor}. Убедительно просим не опаздывать.',
        'en': 'Hello, {name}! Just a reminder that next week on {date} at {time} you have an appointment at {clinic}. Doctor: {doctor}. Please arrive on time.',
    },
}


def _load(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def _save(path, data):
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('reminders save error:', e)


def _get_cfg_file(clinic_id=None):
    if clinic_id and str(clinic_id) != '1':
        return os.path.join(settings.BASE_DIR, f'reminders_config_clinic_{clinic_id}.json')
    return _CFG_FILE


def _config(clinic_id=None):
    cfg_file = _get_cfg_file(clinic_id)
    cfg = _load(cfg_file, None)
    if not cfg:
        d = dict(_DEFAULTS)
        if clinic_id and str(clinic_id) != '1':
            d['enabled'] = False
        return d
    merged = dict(_DEFAULTS)
    if clinic_id and str(clinic_id) != '1' and 'enabled' not in cfg:
        merged['enabled'] = False
    merged.update(cfg)
    for k in ('day', 'week', 'hour'):
        m = dict(_DEFAULTS[k])
        m.update(cfg.get(k, {}))
        merged[k] = m
    return merged


def get_tashkent_now():
    if not getattr(settings, 'USE_TZ', False):
        return datetime.datetime.now()
    now_utc = timezone.now()
    try:
        return now_utc.astimezone(TASHKENT_TZ)
    except Exception:
        return now_utc + datetime.timedelta(hours=5)


def _render(text, apt, when_dt):
    doc_name = apt.doctor.full_name if apt.doctor else 'Shifokor'
    branch = getattr(apt, 'branch', None) or (getattr(apt.doctor, 'branch', None) if getattr(apt, 'doctor', None) else None)
    branch_name = branch.name if branch else ''
    branch_address = branch.address if branch else ''
    branch_phone = branch.phone if branch else ''
    branch_loc = branch.location_url if branch else ''

    rendered = (text or '') \
        .replace('{name}', apt.patient.full_name or 'Bemor') \
        .replace('{phone}', apt.patient.phone or '') \
        .replace('{clinic}', CLINIC_NAME) \
        .replace('{date}', when_dt.strftime('%d.%m.%Y')) \
        .replace('{time}', when_dt.strftime('%H:%M')) \
        .replace('{doctor}', doc_name) \
        .replace('{branch}', branch_name) \
        .replace('{branch_name}', branch_name) \
        .replace('{branch_address}', branch_address) \
        .replace('{branch_phone}', branch_phone) \
        .replace('{branch_location}', branch_loc) \
        .replace('{location}', branch_loc)

    # Filial manzili va xarita lokatsiyasi SMS/Telegramga kiritilishi
    if branch and getattr(branch, 'include_location_in_sms', True):
        extra_parts = []
        if branch_name and branch_name not in rendered:
            extra_parts.append(f"Filial: {branch_name}")
        if branch_address and branch_address not in rendered:
            extra_parts.append(f"Manzil: {branch_address}")
        if branch_phone and branch_phone not in rendered:
            extra_parts.append(f"Tel: {branch_phone}")
        if branch_loc and branch_loc not in rendered:
            extra_parts.append(f"Lokatsiya: {branch_loc}")
        if extra_parts:
            rendered = f"{rendered}\n📌 " + " | ".join(extra_parts)

    return rendered


def send_dual_reminder(session_str, phone, text, name, send_tg=True, send_sms_flag=True):
    """Xabarni Telegram va SMS kanallari orqali yetkazadi."""
    tg_sent = False
    sms_sent = False

    # 1. Telegram
    if send_tg and session_str and phone:
        try:
            res = telegram_auth._manager.run(
                telegram_auth._send_to(session_str, phone, text, name),
                timeout=60
            )
            tg_sent = bool(res and res.get('ok') and res.get('found'))
        except Exception as e:
            print('Telegram reminder send error:', e)

    # 2. SMS (Eskiz / SMS shlyuz)
    if send_sms_flag and phone:
        try:
            sms_res = sms_service.send_sms(phone, text)
            sms_sent = bool(sms_res and sms_res.get('ok'))
        except Exception as e:
            print('SMS reminder send error:', e)

    return {'telegram': tg_sent, 'sms': sms_sent, 'any': tg_sent or sms_sent}


def run_reminders(force=False):
    """
    Eslatmalarni tekshiradi va yuboradi.
    Toshkent vaqti bilan:
      - 18:00 (kechki 6): dam olish kuni (Yakshanba) kelasi hafta qabullari uchun
      - 18:00: har qanday qabuldan 1 kun oldin ertangi kun uchun
    force=True -> test tugmasi orqali vaqt/yoqilganlik chegarasisiz yuboradi.
    """
    cfg = _config()
    if not cfg.get('enabled') and not force:
        return {'ok': True, 'skipped': 'disabled', 'sent': 0}

    now_tashkent = get_tashkent_now()
    schedule_hour = int(cfg.get('schedule_hour', 18))

    # 1 kun oldin / haftalik eslatmalar faqat belgilangan soatda (18:00) yuboriladi.
    # 1 SOAT oldin eslatma esa har tik (kun davomida) ishlaydi — shuning uchun early-return yo'q.
    can_run_daily = force or now_tashkent.hour >= schedule_hour

    # Ulangan Telegram sessiyasi bormi tekshiramiz
    sessions = telegram_auth._load_sessions()
    session_str = next(iter(sessions.values()))['session'] if sessions else None

    send_tg = bool(cfg.get('send_telegram', True)) and bool(session_str)
    send_sms_flag = bool(cfg.get('send_sms', True))

    today = now_tashkent.date()
    tomorrow = today + datetime.timedelta(days=1)
    is_sunday = (now_tashkent.weekday() == 6)  # Yakshanba (dam olish kuni)

    sent = _load(_SENT_FILE, {})
    default_lang = cfg.get('lang', 'uz')
    count = 0
    results = []

    # Barcha bekor qilinmagan kelgusi qabullar
    apts = Appointment.objects.select_related('patient', 'doctor').exclude(status='cancelled').filter(start_time__gte=now_tashkent)

    for apt in apts:
        try:
            when = apt.start_time.astimezone(TASHKENT_TZ) if timezone.is_aware(apt.start_time) else apt.start_time
        except Exception:
            when = apt.start_time
        apt_date = when.date()
        phone = (apt.patient.phone or '').strip()
        if not phone:
            continue

        # Bemor tili (har doim bazadagi eng yangi xizmat tilini to'g'ridan-to'g'ri olamiz)
        patient_obj = Patient.objects.filter(id=apt.patient_id).first()
        raw_lang = (patient_obj.service_lang if patient_obj else getattr(apt.patient, 'service_lang', None)) or default_lang or 'uz'
        lang = str(raw_lang).strip().lower()
        if lang not in ('uz', 'ru', 'en'):
            lang = 'uz'

        # 0) QABULDAN 1 SOAT OLDIN (kun davomida, soat chegarasisiz)
        if cfg.get('hour_before') or force:
            mins_to_apt = (when - now_tashkent).total_seconds() / 60.0
            # ~45-75 daqiqa oralig'idagi qabullar (scheduler har 30 daqiqada ishlaydi)
            if (45 <= mins_to_apt <= 75) or force:
                key = f'{apt.id}_hour_{when.strftime("%Y%m%d%H%M")}'
                if key not in sent or force:
                    text = _render(cfg['hour'].get(lang) or cfg['hour']['uz'], apt, when)
                    delivery = send_dual_reminder(session_str, phone, text, apt.patient.full_name, send_tg, send_sms_flag)
                    if delivery['any'] or force:
                        sent[key] = now_tashkent.isoformat()
                        count += 1
                        results.append({'apt': apt.id, 'type': 'hour_before', 'to': apt.patient.full_name, 'delivery': delivery})

        # 1) QABULDAN 1 KUN OLDIN SOAT 18:00 DA
        if can_run_daily and cfg.get('day_before') and apt_date == tomorrow:
            key = f'{apt.id}_day_{apt_date.isoformat()}'
            if key not in sent or force:
                text = _render(cfg['day'].get(lang) or cfg['day']['uz'], apt, when)
                delivery = send_dual_reminder(session_str, phone, text, apt.patient.full_name, send_tg, send_sms_flag)
                if delivery['any'] or force:
                    sent[key] = now_tashkent.isoformat()
                    count += 1
                    results.append({'apt': apt.id, 'type': 'day_before', 'to': apt.patient.full_name, 'delivery': delivery})

        # 2) DAM OLISH KUNI (YAKSHANBA) KELASI HAFTADAGI QABULLAR UCHUN (Dushanba - Yakshanba)
        if can_run_daily and ((cfg.get('this_week') and is_sunday) or force):
            days_ahead = (apt_date - today).days
            if 1 <= days_ahead <= 7:
                key = f'{apt.id}_weekly_{today.isoformat()}'
                if key not in sent or force:
                    text = _render(cfg['week'].get(lang) or cfg['week']['uz'], apt, when)
                    delivery = send_dual_reminder(session_str, phone, text, apt.patient.full_name, send_tg, send_sms_flag)
                    if delivery['any'] or force:
                        sent[key] = now_tashkent.isoformat()
                        count += 1
                        results.append({'apt': apt.id, 'type': 'weekly', 'to': apt.patient.full_name, 'delivery': delivery})

    _save(_SENT_FILE, sent)
    return {'ok': True, 'sent': count, 'results': results}


# ============================================================================
# NLP INTELLIGENT REPLY PARSER (Bemor javoblarini tahlil qilish algoritmi)
# ============================================================================

# Kalit so'zlar to'plami
CONFIRM_KEYWORDS = [
    r'\bha\b', r'\bboraman\b', r'\bkelaman\b', r'\btasdiqlayman\b', r'\btasdiq\b',
    r'\balbatta\b', r'\bbo\'ladi\b', r'\bboladi\b', r'\bxudo xohlasa\b',
    r'\bvaqtida boraman\b', r'\bo\'sha yerdaman\b', r'\bok\b', r'\bokey\b',
    r'\bboramiz\b', r'\bkelamiz\b', r'\byep\b',
    r'\bда\b', r'\bбуду\b', r'\bприду\b', r'\bподтверждаю\b', r'\bконечно\b',
    r'\bбудем\b', r'\bточно\b', r'\bобязательно\b', r'\bхорошо\b', r'\bспасибо\b',
    r'\byes\b', r'\bconfirm\b', r'\bi will come\b', r'\bsure\b', r'\bi\'ll be there\b'
]

LATE_KEYWORDS = [
    r'\bkechikaman\b', r'\bkechikamiz\b', r'\bsal kechroq\b', r'\bkech qolaman\b',
    r'\bkech qolsam\b', r'\b10 minut\b', r'\b15 minut\b', r'\b20 minut\b', r'\b30 minut\b',
    r'\bbir oz kech\b', r'\bsal kech\b',
    r'\bопоздаю\b', r'\bзадержусь\b', r'\bнемного опоздаю\b', r'\bчуть позже\b',
    r'\bна 10 минут\b', r'\bна 15 минут\b', r'\bна 20 минут\b', r'\bна полчаса\b',
    r'\blate\b', r'\bi will be late\b', r'\bdelay\b', r'\brunning late\b'
]

CANCEL_KEYWORDS = [
    r'\bkela olmayman\b', r'\bkelolmayman\b', r'\bbora olmayman\b', r'\bborolmayman\b',
    r'\bbormayman\b', r'\bkelmayman\b', r'\bbekor qiling\b', r'\bbekor qilish\b',
    r'\bbekor\b', r'\bvaqtim yo\'q\b', r'\brad etaman\b', r'\bafsuski bormayman\b',
    r'\byo\'q\b', r'\byoq\b',
    r'\bне смогу\b', r'\bне приду\b', r'\bотмените\b', r'\bотмена\b',
    r'\bне получается\b', r'\bне буду\b', r'\bотменить\b',
    r'\bcannot come\b', r'\bcancel\b', r'\bwon\'t make it\b', r'\bno\b'
]

RESCHEDULE_KEYWORDS = [
    r'boshqa vaqtga', r'ko\'chiring', r'ko\'chirish', r'ko\'chir', r'kochir',
    r'boshqa kunga', r'boshqa soatga', r'boshqa payt', r'vaqtini o\'zgartir',
    r'sanani o\'zgartir', r'o\'zgartirmoqchiman', r'ozgartirmoqchiman',
    r'o\'zgartir', r'ozgartir', r'almashtir', r'ertaga emas', r'vaqtim yo\'q boshqa',
    r'kela olmayman boshqa', r'ertalab band', r'перенести', r'перенесите',
    r'другое время', r'другой день', r'поменять время', r'поменять дату',
    r'изменить время', r'изменить дату', r'утром занят', r'reschedule',
    r'change time', r'another day', r'postpone'
]


def detect_intent(text: str) -> str:
    """
    Matndan niyatni (intent) aniqlaydi:
    - 'confirm'
    - 'late'
    - 'cancel'
    - 'reschedule'
    - 'unknown'
    """
    if not text:
        return 'unknown'
    lower = text.lower().strip()

    # 1. Reschedule check (Boshqa vaqtga ko'chirish)
    for pat in RESCHEDULE_KEYWORDS:
        if re.search(pat, lower):
            return 'reschedule'

    # 2. Cancel check (Bekor qilish / Kelolmaslik)
    for pat in CANCEL_KEYWORDS:
        if re.search(pat, lower):
            return 'cancel'

    # 3. Late check (Kechikish)
    for pat in LATE_KEYWORDS:
        if re.search(pat, lower):
            return 'late'

    # 4. Confirmation check (Tasdiqlash)
    for pat in CONFIRM_KEYWORDS:
        if re.search(pat, lower):
            return 'confirm'

    # 5. Algoritm tushunmaydigan boshqa gaplar
    return 'unknown'


def detect_language_from_text(text: str) -> str:
    """
    Xabar matnidan bemor qaysi tilda gapirayotganini aniqlaydi: 'ru', 'uz', 'en' yoki None.
    Bemor istalgan payt xizmat tili o'zgarishi mumkin (masalan, ruscha, o'zbekcha yoki inglizcha yozsa),
    tizim buni darhol tushunadi va o'sha tilda javob qaytaradi hamda bemor profilini yangilaydi.
    """
    if not text:
        return None
    raw = text.strip().lower()

    # 1. Rus tili tekshiruvi:
    # O'zbekcha kirill belgilari (ў, қ, ғ, ҳ, ҳа, йўқ, бўлади, бораман, келаман, кечикаман)
    uz_cyrillic_markers = [r'[ўқғҳ]', r'\bҳа\b', r'\bйўқ\b', r'\bбўлади\b', r'\bбораман\b', r'\bкеламан\b', r'\bкечикаман\b', r'\bраҳмат\b']
    if any(re.search(pat, raw) for pat in uz_cyrillic_markers):
        return 'uz'

    # Ruscha kalit so'zlar
    ru_markers = [
        r'\bда\b', r'\bбуду\b', r'\bприду\b', r'\bподтверждаю\b', r'\bконечно\b',
        r'\bбудем\b', r'\bточно\b', r'\bобязательно\b', r'\bхорошо\b', r'\bспасибо\b',
        r'\bопоздаю\b', r'\bзадержусь\b', r'\bнемного опоздаю\b', r'\bчуть позже\b',
        r'\bна \d+ минут\b', r'\bминут на\b', r'\bне смогу\b', r'\bне приду\b',
        r'\bотмените\b', r'\bотмена\b', r'\bне получается\b', r'\bне буду\b',
        r'\bперенести\b', r'\bдругое время\b', r'\bперенесите\b', r'\bдругой день\b',
        r'\bздравствуйте\b', r'\bпривет\b', r'\bдобрый\b'
    ]
    if any(re.search(pat, raw) for pat in ru_markers):
        return 'ru'

    # Agar 2 yoki undan ortiq kirill harfi bo'lsa va o'zbekcha belgi bo'lmasa -> 'ru'
    cyrillic_count = len(re.findall(r'[\u0400-\u04FF]', raw))
    if cyrillic_count >= 2:
        return 'ru'

    # 2. Ingliz tili tekshiruvi:
    en_markers = [
        r'\byes\b', r'\bconfirm\b', r'\bi will come\b', r'\bsure\b', r'\bi\'ll be there\b',
        r'\bi will be\b', r'\blate\b', r'\bdelay\b', r'\brunning late\b', r'\bcancel\b',
        r'\bcannot come\b', r'\bwon\'t make it\b', r'\breschedule\b', r'\bchange time\b',
        r'\banother day\b', r'\bpostpone\b', r'\bthank you\b', r'\bthanks\b', r'\bhello\b',
        r'\bhi\b', r'\bplease\b', r'\bi can\'t\b', r'\bi cannot\b'
    ]
    if any(re.search(pat, raw) for pat in en_markers):
        return 'en'

    # 3. O'zbek tili (Lotin) tekshiruvi:
    uz_latin_markers = [
        r'\bha\b', r'\bboraman\b', r'\bkelaman\b', r'\btasdiqlayman\b', r'\btasdiq\b',
        r'\balbatta\b', r'\bbo\'ladi\b', r'\bboladi\b', r'\bxudo xohlasa\b',
        r'\bvaqtida boraman\b', r'\bo\'sha yerdaman\b', r'\bboramiz\b', r'\bkelamiz\b',
        r'\bkechikaman\b', r'\bkechikamiz\b', r'\bsal kechroq\b', r'\bkech qolaman\b',
        r'\bkela olmayman\b', r'\bkelolmayman\b', r'\bbora olmayman\b', r'\bborolmayman\b',
        r'\bbormayman\b', r'\bkelmayman\b', r'\bbekor qiling\b', r'\bbekor qilish\b',
        r'\bbekor\b', r'\bvaqtim yo\'q\b', r'\byo\'q\b', r'\byoq\b', r'\brahmat\b',
        r'\bboshqa vaqtga\b', r'\bko\'chiring\b', r'\bko\'chirish\b', r'\bvaqtini o\'zgartiring\b',
        r'\bassalomu alaykum\b', r'\bsalom\b'
    ]
    if any(re.search(pat, raw) for pat in uz_latin_markers):
        return 'uz'

    return None


def process_patient_reply(phone: str, text: str, appointment_id: int = None) -> dict:
    """
    Bemor javobini qabul qiladi, algoritm orqali tahlil qiladi va:
    - Har doim bemorning eng so'nggi xizmat tilini (yoki xabar yozgan tilini) inobatga oladi.
    - Bemor tili luboy payt o'zgarsa (masalan, ruscha, o'zbekcha yoki inglizcha yozsa),
      yangi tilni darhol bazada saqlaydi va o'sha tilda javob beradi.
    - Tushunarli bo'lsa statusni avtomatik yangilaydi va xushmuomala javob qaytaradi.
    - Agar algoritm so'zlari ichida yo'q bo'lsa: statusga TEGINMAYDI, admin ko'rib chiqishi uchun qoldiradi.
    """
    clean_phone = ''.join(ch for ch in (phone or '') if ch.isdigit())
    now_tashkent = get_tashkent_now()
    today = now_tashkent.date()

    # Bemor va uning eng yaqin qabulini topamiz
    apt = None
    if appointment_id:
        try:
            apt = Appointment.objects.select_related('patient', 'doctor').get(id=appointment_id)
        except Appointment.DoesNotExist:
            pass

    if not apt and clean_phone:
        # Telefon orqali eng yaqin qabulni topamiz
        apt = Appointment.objects.select_related('patient', 'doctor').filter(
            patient__phone__icontains=clean_phone[-9:],
            start_time__date__gte=today
        ).order_by('start_time').first()

    if not apt and clean_phone:
        apt = Appointment.objects.select_related('patient', 'doctor').filter(
            patient__phone__icontains=clean_phone[-9:]
        ).order_by('-start_time').first()

    intent = detect_intent(text)
    detected_lang = detect_language_from_text(text)

    response_data = {
        'ok': True,
        'intent': intent,
        'input_text': text,
        'phone': phone,
        'appointment_id': apt.id if apt else None,
        'old_status': apt.status if apt else None,
        'new_status': apt.status if apt else None,
        'action_taken': 'none',
        'reply_message': '',
        'detected_language': detected_lang
    }

    if not apt:
        response_data['note'] = 'Bemorga tegishli faol qabul topilmadi.'
        return response_data

    # Bemorning joriy xizmat tilini bazadan yangilab olamiz
    try:
        apt.patient.refresh_from_db()
    except Exception:
        pass

    current_lang = (getattr(apt.patient, 'service_lang', None) or 'uz').strip().lower()
    if current_lang not in ('uz', 'ru', 'en'):
        current_lang = 'uz'

    # MUHIM: Agar bemor o'zi boshqa tilda yozgan bo'lsa (masalan, ruscha, o'zbekcha yoki inglizcha),
    # uning xizmat tili o'zgartiriladi va bazada saqlanadi!
    if detected_lang and detected_lang in ('uz', 'ru', 'en'):
        if detected_lang != current_lang:
            apt.patient.service_lang = detected_lang
            try:
                apt.patient.save(update_fields=['service_lang'])
            except Exception:
                apt.patient.save()
            current_lang = detected_lang
            response_data['language_changed_to'] = detected_lang

    p_lang = current_lang
    response_data['patient_language'] = p_lang

    apt_date = apt.start_time.astimezone(TASHKENT_TZ).date() if timezone.is_aware(apt.start_time) else apt.start_time.date()
    time_str = apt.start_time.strftime('%H:%M')
    p_name = apt.patient.full_name or 'Bemor'

    # 1. TASDIQLASH (Confirm -> 'confirmed')
    if intent == 'confirm':
        apt.status = 'confirmed'
        apt.color_code = '#06B6D4'
        apt.save()
        response_data['new_status'] = 'confirmed'
        response_data['action_taken'] = 'status_updated'
        if p_lang == 'ru':
            response_data['reply_message'] = (
                f"Большое спасибо, {p_name}! Ваш приём успешно подтверждён. "
                f"Ждём вас в назначенное время ({time_str}) в нашей клинике. "
                f"Убедительно просим не опаздывать!"
            )
        elif p_lang == 'en':
            response_data['reply_message'] = (
                f"Thank you, {p_name}! Your appointment has been confirmed. "
                f"We look forward to seeing you at {time_str}. "
                f"We kindly ask you to arrive on time!"
            )
        else:
            response_data['reply_message'] = (
                f"Katta rahmat, {p_name}! Qabulingiz muvaffaqiyatli tasdiqlandi. "
                f"Sizni belgilangan vaqtda ({time_str}) klinikamizda kutib qolamiz. "
                f"Kechikmasligingizni so‘rab qolamiz!"
            )

    # 2. KECHIKISH (Late -> 'late')
    elif intent == 'late':
        apt.status = 'late'
        apt.color_code = '#F97316'
        apt.save()
        response_data['new_status'] = 'late'
        response_data['action_taken'] = 'status_updated'
        if p_lang == 'ru':
            response_data['reply_message'] = (
                f"Ваше сообщение принято, {p_name}. Врач предупреждён о вашей задержке. "
                f"Ждём вас в клинике."
            )
        elif p_lang == 'en':
            response_data['reply_message'] = (
                f"Understood, {p_name}. The doctor has been informed of your delay. "
                f"We will wait for you at the clinic."
            )
        else:
            response_data['reply_message'] = (
                f"Xabaringiz qabul qilindi, {p_name}. Kechikishingiz haqida shifokorga xabar berildi. "
                f"Sizni klinikamizda kutib qolamiz."
            )

    # 3. KELMASLIK / BEKOR QILISH (Cancel/No Show)
    elif intent == 'cancel':
        # Agar bugungi kun bo'lsa -> 'no_show' (Kelmadi), kelajak kun bo'lsa -> 'cancelled' (Bekor qilingan)
        if apt_date <= today:
            apt.status = 'no_show'
            apt.color_code = '#DC2626'
        else:
            apt.status = 'cancelled'
            apt.color_code = '#EF4444'
        apt.save()
        response_data['new_status'] = apt.status
        response_data['action_taken'] = 'status_updated'
        if p_lang == 'ru':
            response_data['reply_message'] = (
                f"Ваше сообщение принято, {p_name}. Запись отменена. "
                f"Если вам понадобится записаться на другое время, вы всегда можете связаться с нами."
            )
        elif p_lang == 'en':
            response_data['reply_message'] = (
                f"Understood, {p_name}. Your appointment has been cancelled. "
                f"Please contact us whenever you would like to reschedule."
            )
        else:
            response_data['reply_message'] = (
                f"Xabaringiz qabul qilindi, {p_name}. Qabulingiz bekor qilindi. "
                f"Sizga boshqa qulay vaqtga qayta yozilish kerak bo‘lsa, istalgan payt biz bilan bog‘lanishingiz mumkin."
            )

    # 4. BOSHQA VAQTGA KO'CHIRISH (Reschedule)
    elif intent == 'reschedule':
        apt.status = 'unconfirmed'
        apt.color_code = '#F59E0B'
        if '[Bemor ko‘chirishni so‘radi]' not in (apt.treatment_notes or ''):
            apt.treatment_notes = f"{apt.treatment_notes or ''} [Bemor ko‘chirishni so‘radi]".strip()
        apt.save()
        response_data['new_status'] = 'unconfirmed'
        response_data['action_taken'] = 'flagged_for_reschedule'
        if p_lang == 'ru':
            response_data['reply_message'] = (
                f"Ваше сообщение принято, {p_name}. По вопросу переноса записи на другое удобное время "
                f"наш администратор свяжется с вами в ближайшее время."
            )
        elif p_lang == 'en':
            response_data['reply_message'] = (
                f"Understood, {p_name}. Our administrator will contact you shortly to reschedule your appointment."
            )
        else:
            response_data['reply_message'] = (
                f"Xabaringiz qabul qilindi, {p_name}. Qabulingizni boshqa qulay vaqtga ko‘chirish bo‘yicha "
                f"tez orada administratorimiz siz bilan bog‘lanadi."
            )

    # 5. ALGORITMDA YO'Q / TUSHUNARSIZ GAP (Unknown)
    else:
        # Foydalanuvchi talabi:
        # "agar chunmidigan yok gapida algoritim so'zlarimiz ichida yozgan habarini ichida yo'q bo'lsa
        # teginma admin qarab qiladi o'z"
        response_data['action_taken'] = 'manual_review_needed'
        response_data['reply_message'] = ''
        response_data['note'] = 'Algoritm niyatni aniqlay olmadi. Qabul holatiga tegilmadi, administrator ko‘rib chiqishi uchun qoldirildi.'

    return response_data


# ============================================================================
# Background scheduler
# ============================================================================
_scheduler_started = False


def _loop():
    while True:
        try:
            run_reminders()
        except Exception as e:
            print('reminder loop error:', e)
        time.sleep(1800)  # har 30 daqiqada tekshiradi


def start_scheduler():
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True
    t = threading.Thread(target=_loop, daemon=True)
    t.start()


# ============================================================================
# API Endpointlar
# ============================================================================
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def config(request):
    raw_cid = request.headers.get('X-Clinic-ID') or request.headers.get('X-Clinic-Id') or request.GET.get('clinic')
    clinic_id = int(raw_cid) if raw_cid and str(raw_cid).isdigit() else None
    cfg_file = _get_cfg_file(clinic_id)

    if request.method == 'POST':
        cfg = _config(clinic_id)
        for k in ('enabled', 'send_telegram', 'send_sms', 'day_before', 'this_week', 'schedule_hour'):
            if k in request.data:
                cfg[k] = request.data.get(k)
        if 'lang' in request.data:
            cfg['lang'] = str(request.data.get('lang') or 'uz')
        for grp in ('day', 'week'):
            if grp in request.data and isinstance(request.data.get(grp), dict):
                m = dict(cfg[grp])
                m.update(request.data.get(grp))
                cfg[grp] = m
        _save(cfg_file, cfg)
        return Response({'ok': True, 'config': cfg})
    return Response(_config(clinic_id))


@api_view(['POST'])
@permission_classes([AllowAny])
def run_now(request):
    """Qo'lda tekshirish/yuborish (test uchun)."""
    res = run_reminders(force=True)
    return Response(res)


@api_view(['POST'])
@permission_classes([AllowAny])
def process_reply(request):
    """
    Bemor Telegram yoki SMS orqali javob berganda chaqiriladigan NLP tahlilchi endpoint.
    Frontend sozlamalarida yoki chatda algoritmni jonli test qilish uchun ham ishlatiladi.
    """
    phone = str(request.data.get('phone', '')).strip()
    text = str(request.data.get('text', '')).strip()
    appointment_id = request.data.get('appointment_id', None)

    if not text:
        return Response({'ok': False, 'error': 'empty_text', 'message': 'Matn bo‘sh'}, status=400)

    result = process_patient_reply(phone, text, appointment_id)
    return Response(result)
