"""Deterministic multilingual reception. No external language model or medical advice."""
import datetime as dt
import re
from zoneinfo import ZoneInfo
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from .models import ClinicTenant, Patient, Employee, Appointment, ClinicTask, Branch
from .reception_models import ReceptionContact
from .reception_time import learn_timezone, appointment_time

ACTIVE = ['new', 'unconfirmed', 'confirmed', 'reserved', 'late']
BUSY = ACTIVE + ['arrived', 'in_progress', 'waiting_bill']
DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
MESSAGES = {
 'menu': ("Assalomu alaykum! Klinikamizga xush kelibsiz. Qanday yordam beray — konsultatsiyaga yozilmoqchimisiz yoki oldingi qabulingiz bo‘yicha yozdingizmi?", "Здравствуйте! Рады вам помочь. Хотите записаться на консультацию или уточнить уже назначенный приём?", "Hello! Welcome to our clinic. Would you like to book a consultation or check an existing appointment?"),
 'contact': ("Davom etish uchun pastdagi tugma orqali o‘zingizning telefon kontaktingizni ulashing.", "Для продолжения поделитесь своим контактом кнопкой ниже.", "Please share your own phone contact using the button below."),
 'name': ("Ism-familiyangizni yozing.", "Напишите ваше имя и фамилию.", "What is your full name?"),
 'doctor': ("Qaysi shifokorga yozilishni istaysiz? Ismini yoki ro‘yxatdagi raqamini yozishingiz mumkin:", "Выберите врача, отправив номер:", "Choose a doctor by number:"),
 'date': ("Qaysi kun qulay? Masalan: ertaga yoki 25.10.2026.", "Какой день удобен? Например: завтра или 25.10.2026.", "Which day works? For example: tomorrow or 25.10.2026."),
 'slots': ("Quyidagi vaqtlar bo‘sh. Qaysi biri sizga qulay? (Toshkent vaqti)", "Вот свободное время. Какое вам удобно? (Время Ташкента)", "These times are available. Which works for you? (Tashkent time)"),
 'no_slots': ("Bu kuni mos bo‘sh vaqt yo‘q yoki ish jadvali belgilanmagan. Boshqa sana yozing yoki «operator» deng.", "На этот день нет доступного времени или график не заполнен. Выберите другой день или напишите «оператор».", "No available times, or the schedule is not configured. Choose another date or type operator."),
 'review': ("Shu qabulni saqlaymizmi? «Ha» yoki «yo‘q» deb yozing.", "Сохранить эту запись? Ответьте «да» или «нет».", "Save this appointment? Reply yes or no."),
 'saved': ("Yozib qo‘ydim, sizni kutamiz! Rejangiz o‘zgarsa, shu yerga yozishingiz mumkin.", "Запись сохранена. Ждём вас!", "Your appointment is saved. See you soon!"),
 'existing': ("Sizda qabul bor. «Kelaman», «ko‘chirish» yoki «bekor qilish» deb yozing.", "У вас есть запись. Напишите «приду», «перенести» или «отменить».", "You have an appointment. Reply confirm, reschedule or cancel."),
 'choose_apt': ("Qaysi qabul? Raqamini yuboring:", "Какая запись? Отправьте номер:", "Which appointment? Send its number:"),
 'none': ("Kelgusi qabul topilmadi. Konsultatsiyaga yozilish uchun «zapis» deb yozing.", "Будущих записей нет. Для консультации напишите «запись».", "No upcoming visit found. Type book for a consultation."),
 'confirmed': ("Kelishingiz tasdiqlandi, rahmat!", "Спасибо, ваше посещение подтверждено!", "Thank you, your attendance is confirmed!"),
 'cancel_review': ("Qabulni bekor qilaymi? «Ha» deb tasdiqlang yoki «yo‘q» deb yozing.", "Отменить запись? Подтвердите: «да» или «нет».", "Cancel this appointment? Please reply yes or no."),
 'cancelled': ("Qabul bekor qilindi. Qayta yozilish uchun «zapis» deb yozing.", "Запись отменена. Для новой записи напишите «запись».", "Appointment cancelled. Type book to book again."),
 'unchanged': ("O‘zgarish saqlanmadi.", "Изменения не сохранены.", "No changes were saved."),
 'unavailable': ("Bu vaqt endi bo‘sh emas. Boshqa vaqt tanlang.", "Это время уже недоступно. Выберите другое.", "That time is no longer available. Please choose another."),
 'human': ("Bu masalani hamkasbimizga qoldirdim, siz bilan shu yerda bog‘lanadi.", "Передал запрос администратору. Он свяжется с вами. Возобновить автоматический диалог: /start", "I have left a task for the administrator to contact you. Resume the automated chat with /start."),
 'unknown': ("To‘liq tushunmadim. «Zapis», «qabullarim», «shifokorlar», «narx», «manzil» yoki «operator» deb yozing.", "Не совсем понял. Напишите «запись», «мои записи», «врачи», «цены», «адрес» или «оператор».", "I did not understand. Try book, my appointments, doctors, prices, address or operator."),
 'stop': ("Eslatmalar o‘chirildi. Qayta yoqish: /start", "Напоминания отключены. Включить: /start", "Reminders disabled. Use /start to enable them."),
 'day': ("Ertaga qabulingiz bor. Kelishingizni aniqlashtiramiz.", "Напоминаем о завтрашнем приёме. Подтвердите посещение.", "Your appointment is tomorrow. Please confirm attendance."),
 'week': ("Kelasi haftadagi qabulingizni eslatamiz.", "Напоминаем о вашем приёме на следующей неделе.", "A reminder about your appointment next week."),
}


def say(lang, key):
    return MESSAGES[key][{'uz': 0, 'ru': 1, 'en': 2}.get(lang, 0)]


def now_local():
    value = dt.datetime.now(ZoneInfo('Asia/Tashkent'))
    return value if settings.USE_TZ else value.replace(tzinfo=None)


def normalize(text):
    text = (text or '').lower().strip()
    for ch in '‘’ʻʼ`':
        text = text.replace(ch, "'")
    # Uzbek Cyrillic is accepted by the same intent rules; preserve Russian words.
    if re.search('[ўқғҳ]', text):
        alphabet = dict(zip('абвгдеёзийклмнопрстуфхцэ', ['a','b','v','g','d','e','yo','z','i','y','k','l','m','n','o','p','r','s','t','u','f','x','ts','e']))
        alphabet.update({'ў': "o'", 'қ':'q', 'ғ':"g'", 'ҳ':'h','ш':'sh','ч':'ch','ж':'j','ю':'yu','я':'ya','н':'n','ь':'','ъ':"'"})
        text = ''.join(alphabet.get(c, c) for c in text)
    return text


def language(text, previous='uz'):
    t = normalize(text)
    if t in ['/uz', 'uz', "o'zbekcha", 'uzbek']: return 'uz'
    if t in ['/ru', 'ru', 'русский']: return 'ru'
    if t in ['/en', 'en', 'english']: return 'en'
    if re.search(r"salom|assalom|zapis|kelaman|shifokor|ertaga|narx|yoz|ko'ch|qabul|rahmat", t): return 'uz'
    if re.search('[а-яё]', t): return 'ru'
    if re.search(r'\b(hello|hi|book|doctor|tomorrow|reschedule|cancel|price|yes|thanks)\b', t): return 'en'
    return previous


def intent(text):
    t = normalize(text)
    if re.search(r"ko'?chir|o'?zgartir|boshqa kun|перен|reschedule|change time|postpone", t): return 'move'
    if re.search(r"kelolmay|kela olmay|borolmay|kelmay|bormay|не приду|не смогу|cannot come|can't come", t): return 'cannot'
    if re.search(r'bekor|отмен|cancel', t): return 'cancel'
    if re.search(r'operator|administrator|оператор|администратор|human', t): return 'human'
    if re.search(r'kechik|опозд|running late', t): return 'late'
    if re.fullmatch(r"(?:ha[, ]*|да[, ]*|yes[, ]*)?(?:albatta[ ,]*)?(ha|xa|ha kelaman|kelaman|boraman|tasdiqlayman|bo'ladi|mayli|да|приду|подтверждаю|хорошо|yes|confirm|i will come)[.! ]*", t): return 'yes'
    if re.fullmatch(r"(yo'?q|нет|no)[.! ]*", t): return 'no'
    if re.search(r'qabullarim|zapisim|мои записи|my appointments', t): return 'list'
    if re.search(r'zapis|yozil|yozib|konsult|qabulga|запис|консультац|\bbook\b|consultation', t): return 'book'
    return ''


def parse_day(text):
    t = normalize(text)
    today = now_local().date()
    if re.search(r'indin|послезавтра|day after tomorrow', t): return today + dt.timedelta(days=2)
    if re.search(r'ertaga|завтра|tomorrow', t): return today + dt.timedelta(days=1)
    if re.search(r'bugun|сегодня|today', t): return today
    for names in [('dushanba','понедельник','monday'), ('seshanba','вторник','tuesday'), ('chorshanba','сред','wednesday'), ('payshanba','четверг','thursday'), ('juma','пятниц','friday'), ('shanba','суббот','saturday'), ('yakshanba','воскрес','sunday')]:
        if any(re.search(r'\b' + re.escape(n), t) for n in names):
            index = ['dushanba','seshanba','chorshanba','payshanba','juma','shanba','yakshanba'].index(names[0])
            return today + dt.timedelta(days=(index - today.weekday()) % 7 or 7)
    try:
        m = re.search(r'\b(\d{4})-(\d{2})-(\d{2})\b', t)
        if m: return dt.date(*map(int, m.groups()))
        m = re.search(r'\b(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\b', t)
        if m: return dt.date(int(m[3] or today.year), int(m[2]), int(m[1]))
    except ValueError:
        pass
    return None


def slots(doctor, day, patient_id=None, exclude=None):
    """Use configured shifts only, including branch/chair; never invent availability."""
    if not doctor.is_active or day < now_local().date() or day > now_local().date() + dt.timedelta(days=90): return []
    details = doctor.schedule_details or []
    periods = []
    if details:
        for row in details:
            if row.get('day') == DAYS[day.weekday()] and row.get('enabled', row.get('is_workday', False)):
                for interval in row.get('intervals', []):
                    try:
                        periods.append((dt.time(int(interval['start_hour']), int(interval.get('start_min', 0))), dt.time(int(interval['end_hour']), int(interval.get('end_min', 0))), row.get('branch') or doctor.branch_id, interval.get('chair') or doctor.chair))
                    except (ValueError, KeyError, TypeError): continue
    else:
        # Only recognize explicit common legacy schedules; unknown schedules need staff.
        s = doctor.schedule.lower()
        match = re.search(r'(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})', s)
        max_day = 5 if re.search(r'пн\s*-\s*сб|dushanba\s*-\s*shanba|mon\s*-\s*sat', s) else 4 if re.search(r'пн\s*-\s*пт|mon\s*-\s*fri', s) else -1
        if match and day.weekday() <= max_day:
            try: periods = [(dt.time(int(match[1]), int(match[2])), dt.time(int(match[3]), int(match[4])), doctor.branch_id, doctor.chair)]
            except ValueError: pass
    result = []
    duration = 30
    for start, end, branch, chair in periods:
        if branch and not Branch.objects.filter(pk=branch, clinic_id=doctor.clinic_id, is_active=True).exists(): continue
        point, stop = dt.datetime.combine(day, start), dt.datetime.combine(day, end)
        if settings.USE_TZ:
            point, stop = point.replace(tzinfo=ZoneInfo('Asia/Tashkent')), stop.replace(tzinfo=ZoneInfo('Asia/Tashkent'))
        while point + dt.timedelta(minutes=duration) <= stop:
            finish = point + dt.timedelta(minutes=duration)
            conflicts = Appointment.objects.filter(clinic_id=doctor.clinic_id, status__in=BUSY, start_time__lt=finish, end_time__gt=point).exclude(pk=exclude)
            condition = Q(doctor_id=doctor.pk)
            if chair: condition |= Q(branch_id=branch, chair_name=chair)
            if patient_id: condition |= Q(patient_id=patient_id)
            if point > now_local() and not conflicts.filter(condition).exists():
                result.append({'start': point.isoformat(), 'end': finish.isoformat(), 'branch': branch, 'chair': chair})
            point += dt.timedelta(minutes=30)
    return result


def describe(apt, contact=None):
    address = apt.branch.address if apt.branch else apt.clinic.branch
    return f'#{apt.pk} · {appointment_time(apt.start_time, contact, contact.language if contact else "uz")} · {apt.doctor.full_name}\n{address}'


def handoff(contact, reason):
    ClinicTask.objects.get_or_create(clinic=contact.clinic, patient=contact.patient, title=f'Telegram: {contact.key}'[:255], status='pending', defaults={'description': reason[:2000], 'priority':'medium'})
    contact.human_requested = True
    contact.state = {}


@transaction.atomic
def respond(clinic_id, key, text, verified_phone='', display_name=''):
    clinic = ClinicTenant.objects.select_for_update().get(pk=clinic_id)
    contact, _ = ReceptionContact.objects.select_for_update().get_or_create(clinic=clinic, key=key)
    raw, t = (text or '').strip()[:2000], normalize(text)
    contact.language = language(raw, contact.language)
    lang = contact.language
    learned_zone = learn_timezone(contact, raw)
    def reply(code, extra='', **data):
        contact.save()
        return {'ok':True, 'action':code, 'reply':say(lang, code) + ('\n\n' + extra if extra else ''), 'language':lang, **data}
    if not raw: return reply('unknown')
    if re.search(r'botmisan|odammisan|robotmisan|вы бот|ты бот|are you (?:a )?(?:bot|human)', t):
        contact.save()
        return {'ok':True, 'action':'identity', 'language':lang, 'reply': {'uz':'Men klinikaning virtual yordamchisiman. Qabul va vaqtlarni kelishib beraman; kerak bo‘lsa hamkasbimiz suhbatga qo‘shiladi.', 'ru':'Я виртуальный помощник клиники. Помогу согласовать приём; при необходимости подключится сотрудник.', 'en':'I am the clinic’s virtual assistant. I can arrange your appointment, and a staff member can join when needed.'}[lang]}
    if learned_zone and intent(raw) not in ['book', 'move']:
        contact.save()
        city = contact.timezone_name.split('/')[-1].replace('_', ' ')
        return {'ok':True, 'action':'timezone_saved', 'language':lang, 'reply': {'uz':f'Tushundim, eslatmalarni {city} vaqti bo‘yicha kunduz kuni yuboramiz. Klinikadagi qabul vaqti esa Toshkent vaqti bilan qoladi. Eslatmada ikkala vaqtni ko‘rsatamiz.', 'ru':f'Хорошо, напоминания будем отправлять днём по времени {city}. Приём в клинике указываем по времени Ташкента. В напоминании укажем оба времени.', 'en':f'Got it. Reminders will arrive during daytime in {city}. The clinic appointment remains in Tashkent time. We will include both times in the reminder.'}[lang]}
    if re.fullmatch(r'rahmat[.! ]*|спасибо[.! ]*|thanks[.! ]*|thank you[.! ]*',t):
        contact.save()
        return {'ok':True,'action':'thanks','language':lang,'reply':{'uz':'Arzimaydi! Yana savolingiz bo‘lsa, yozavering.','ru':'Пожалуйста! Если появятся вопросы, пишите.','en':'You’re welcome! Feel free to write if you have any questions.'}[lang]}
    if t in ['/stop', 'stop']:
        contact.opted_out = True
        contact.state = {}
        return reply('stop')
    if t == '/start':
        contact.opted_out = contact.human_requested = False
        contact.state = {}
    if verified_phone and not contact.patient_id:
        digits = re.sub(r'\D', '', verified_phone)
        if 10 <= len(digits) <= 15:
            matches = [p for p in Patient.objects.filter(clinic=clinic, phone__endswith=digits[-7:]) if re.sub(r'\D','',p.phone) == digits]
            if len(matches) > 1:
                handoff(contact, 'Bir telefon raqamida bir nechta bemor. Profilni tekshiring.')
                return reply('human')
            if matches:
                contact.patient = matches[0]
            else:
                contact.state['phone'] = '+' + digits
    if contact.human_requested:
        return {'ok':True, 'action':'human_pending', 'reply':'', 'language':lang}
    if contact.updated_at and timezone.now() - contact.updated_at > dt.timedelta(hours=24):
        contact.state = {}
    state = contact.state
    action = intent(raw)
    if action == 'book' and parse_day(raw):
        state['requested'] = raw
    if action == 'human':
        handoff(contact, raw)
        return reply('human')
    if contact.patient_id:
        Patient.objects.filter(pk=contact.patient_id, clinic=clinic).update(service_lang=lang)
    # Informational questions do not discard a partially completed booking.
    if re.search(r'shifokor|doctor|doktor|врач|доктор', t) and state.get('stage') != 'doctor' and action != 'book':
        doctors = Employee.objects.filter(clinic=clinic, role='doctor', is_active=True)
        details = '\n\n'.join(f'{d.full_name} — {d.specialty}\n{d.schedule}\n{d.bio}' for d in doctors)
        contact.save()
        return {'ok':True,'action':'doctors','reply':details or say(lang,'no_slots'),'language':lang}
    if re.search(r'narx|qancha|цены|цена|стоим|price|cost|manzil|qayer|адрес|address|ish vaqti|working hours', t):
        cfg = clinic.ai_agent_settings or {}
        if re.search(r'narx|qancha|цен|стоим|price|cost', t):
            prices = cfg.get('price_list', [])
            info = '\n'.join(str(p) if not isinstance(p,dict) else ' — '.join(str(v) for k,v in p.items() if k in ['name','service','price','currency']) for p in prices)
        else:
            info = '\n'.join(f'{b.name}: {b.address} {b.phone}' for b in Branch.objects.filter(clinic=clinic,is_active=True))
            info += '\n' + str(cfg.get('working_hours',''))
        contact.save()
        return {'ok':True,'action':'information','reply':(info.strip() or say(lang,'unknown')) + '\n' + clinic.phone,'language':lang}
    if re.search(r'dori|лекар|medicine|doza|дозиров|dosage', t):
        handoff(contact, raw)
        return reply('human')
    if re.search(r"og'ri|ogri|боли|болит|pain", t) and not state.get('stage') and not action:
        action = 'book'
    pending = state.get('stage')
    if key.startswith('tg:') and pending == 'contact' and not contact.patient_id:
        digits = re.sub(r'\D','', raw)
        if re.fullmatch(r'[+\d ()-]+', raw) and 10 <= len(digits) <= 15:
            exists = any(re.sub(r'\D','',p.phone) == digits for p in Patient.objects.filter(clinic=clinic,phone__endswith=digits[-7:]))
            if exists:
                return reply('contact', {'uz':'Oldingi qabulingizni ochish uchun Telegramdagi o‘zingizning kontaktingizni biriktirib yuboring.','ru':'Чтобы открыть прежнюю запись, прикрепите свой контакт Telegram.','en':'Please attach your own Telegram contact to access an existing appointment.'}[lang])
            state['phone'] = '+' + digits
    if action == 'no':
        contact.state = {}
        return reply('unchanged')
    if not contact.patient_id and (action in ['book','move','cancel','list','yes','cannot','late'] or pending or verified_phone):
        if not state.get('phone'):
            state['stage'] = 'contact'
            if key.startswith('tg:'):
                contact.save()
                return {'ok':True,'action':'contact','language':lang,'reply':{'uz':'Siz bilan bog‘lanish uchun telefon raqamingizni yozib yuboring. Oldin bizga yozilgan bo‘lsangiz, Telegramdagi o‘z kontaktingizni biriktiring.','ru':'Напишите ваш номер телефона. Если уже были у нас, прикрепите свой контакт Telegram.','en':'Please send your phone number. If you have an existing appointment, attach your own Telegram contact.'}[lang]}
            return reply('contact', request_contact=True)
        if pending == 'name' and len(raw.split()) >= 2 and len(raw) <= 150 and not action and not re.search(r'[\d?/:]',raw):
            contact.patient = Patient.objects.create(clinic=clinic,full_name=raw,phone=state['phone'],service_lang=lang,category_status='Первичный',notes='Telegram konsultatsiya lid')
            requested = state.get('requested')
            state.clear()
            if requested: state['requested'] = requested
            action = 'book'
        else:
            state['stage'] = 'name'
            return reply('name')
    if contact.patient_id and verified_phone and pending == 'contact':
        contact.state = state = {}
        pending = None
        action = 'book'
    if not contact.patient_id:
        return reply('menu' if t in ['/start','salom','hello','hi','привет','assalomu alaykum','/uz','/ru','/en'] else 'unknown')
    upcoming = list(Appointment.objects.filter(clinic=clinic,patient=contact.patient,status__in=ACTIVE,start_time__gt=now_local()).select_related('doctor','branch','clinic').order_by('start_time'))
    if pending == 'select_apt':
        if not raw.isdigit() or int(raw) < 1 or int(raw) > len(state['appointments']):
            return reply('choose_apt', '\n'.join(f'{i+1}. {describe(a)}' for i,a in enumerate(upcoming)))
        selected = state['appointments'][int(raw)-1]
        if not any(a.pk == selected for a in upcoming):
            contact.state = {}
            return reply('none')
        action = state['intent']
        state.clear()
        state['selected'] = selected
    if (action in ['move','cancel','yes','cannot','late','list'] and pending not in ['review','cancel_review']) or (action == 'book' and upcoming):
        chosen = next((a for a in upcoming if a.pk == state.get('selected')), None)
        if not upcoming: return reply('none')
        if action in ['list','book']:
            return reply('existing', '\n\n'.join(describe(a, contact) for a in upcoming))
        if not chosen and len(upcoming) > 1:
            contact.state = {'stage':'select_apt','intent':action,'appointments':[a.pk for a in upcoming]}
            return reply('choose_apt', '\n'.join(f'{i+1}. {describe(a)}' for i,a in enumerate(upcoming)))
        chosen = chosen or upcoming[0]
        if action == 'yes':
            chosen.status = 'confirmed'
            chosen.save(update_fields=['status'])
            contact.state = {}
            return reply('confirmed', describe(chosen, contact))
        if action == 'late':
            handoff(contact, f'Bemor kechikadi: {describe(chosen, contact)}. {raw}')
            return reply('human')
        if action == 'cannot':
            return reply('existing', describe(chosen, contact))
        if action == 'cancel':
            contact.state = {'stage':'cancel_review','appointment':chosen.pk}
            return reply('cancel_review', describe(chosen, contact))
        contact.state = state = {'stage':'date','doctor':chosen.doctor_id,'appointment':chosen.pk}
        pending = 'date'
    if pending == 'cancel_review':
        if action != 'yes': return reply('cancel_review')
        changed = Appointment.objects.filter(pk=state['appointment'],clinic=clinic,patient=contact.patient,status__in=ACTIVE,start_time__gt=now_local()).update(status='cancelled')
        contact.state = {}
        return reply('cancelled' if changed else 'none')
    if pending == 'review':
        if action != 'yes': return reply('review', state['summary'])
        doctor = Employee.objects.select_for_update().get(pk=state['doctor'],clinic=clinic)
        selected = state['slot']
        available = slots(doctor, dt.datetime.fromisoformat(selected['start']).date(), contact.patient_id, state.get('appointment'))
        if selected not in available:
            state['stage'] = 'date'
            return reply('unavailable')
        if state.get('appointment'):
            apt = Appointment.objects.filter(pk=state['appointment'],clinic=clinic,patient=contact.patient,status__in=ACTIVE,start_time__gt=now_local()).first()
            if not apt:
                contact.state = {}
                return reply('none')
        else:
            # A second request cannot silently create a duplicate visit.
            if upcoming:
                contact.state = {}
                return reply('existing', '\n'.join(describe(a, contact) for a in upcoming))
            apt = Appointment(clinic=clinic,patient=contact.patient,doctor=doctor,treatment_notes='Telegram konsultatsiya (30 min)')
        apt.start_time = dt.datetime.fromisoformat(selected['start'])
        apt.end_time = dt.datetime.fromisoformat(selected['end'])
        apt.branch_id, apt.chair_name = selected['branch'], selected['chair']
        apt.status = 'confirmed'
        apt.save()
        contact.state = {}
        return reply('saved',describe(apt, contact),appointment_id=apt.pk)
    if (action == 'book' and pending not in ['date','slot']) or pending == 'doctor':
        doctors = list(Employee.objects.filter(clinic=clinic,role='doctor',is_active=True).order_by('id'))
        if not doctors: return reply('no_slots')
        if pending == 'doctor':
            ids = state.get('doctors',[])
            doc = next((d for d in doctors if (raw.isdigit() and 0 < int(raw) <= len(ids) and d.pk == ids[int(raw)-1]) or normalize(d.full_name) == t or any(len(part) > 3 and part in t for part in normalize(d.full_name).split())),None)
            if doc:
                state.update(stage='date', doctor=doc.pk)
                requested = state.pop('requested', '')
                if requested:
                    contact.save()
                    return respond(clinic_id, key, requested)
                return reply('date')
        contact.state = {'stage':'doctor','doctors':[d.pk for d in doctors], 'requested':state.get('requested','')}
        return reply('doctor', '\n'.join(f'{i+1}. {d.full_name} — {d.specialty}' for i,d in enumerate(doctors)))
    if state.get('stage') == 'date':
        day = parse_day(raw)
        if not day: return reply('date')
        doctor = Employee.objects.get(pk=state['doctor'],clinic=clinic)
        available = slots(doctor,day,contact.patient_id,state.get('appointment'))
        if not available: return reply('no_slots')
        # Respect broad preferences without inventing a particular time.
        if re.search(r'ertalab band|tushdan keyin|после обеда|afternoon',t):
            available = [item for item in available if dt.datetime.fromisoformat(item['start']).hour >= 12]
        elif re.search(r'ertalab|утром|morning',t):
            available = [item for item in available if dt.datetime.fromisoformat(item['start']).hour < 12]
        if not available: return reply('no_slots')
        state.update(stage='slot',slots=available,day=day.isoformat())
        match = re.search(r'(?:soat|at|в)\s*(\d{1,2})(?::([0-5]\d))?\b|\b([0-2]?\d):([0-5]\d)\b',raw.lower())
        if match:
            hour, minute = int(match[1] or match[3]), int(match[2] or match[4] or 0)
            if 0 <= hour < 24:
                requested_time = f'{hour:02d}:{minute:02d}'
                if any(dt.datetime.fromisoformat(item['start']).strftime('%H:%M') == requested_time for item in available):
                    contact.save()
                    return respond(clinic_id,key,requested_time)
        return reply('slots','\n'.join(f"{i+1}. {dt.datetime.fromisoformat(s['start']):%H:%M}" for i,s in enumerate(available)))
    if state.get('stage') == 'slot':
        available = state['slots']
        selected = None
        if raw.isdigit() and 0 < int(raw) <= len(available): selected = available[int(raw)-1]
        raw_time = re.sub(r'\bsoat\s+(\d{1,2})(?![\d:])\b', r'\1:00', raw.lower())
        match = re.search(r'\b([0-2]?\d):([0-5]\d)\b',raw_time)
        if match: selected = next((s for s in available if dt.datetime.fromisoformat(s['start']).strftime('%H:%M') == f'{int(match[1]):02d}:{match[2]}'),None)
        if not selected:
            if parse_day(raw):
                state['stage'] = 'date'
                contact.save()
                return respond(clinic_id,key,raw)
            return reply('slots','\n'.join(f"{i+1}. {dt.datetime.fromisoformat(s['start']):%H:%M}" for i,s in enumerate(available)))
        doctor = Employee.objects.get(pk=state['doctor'],clinic=clinic)
        state.update(stage='review',slot=selected,summary=f"{appointment_time(dt.datetime.fromisoformat(selected['start']), contact, lang)} · {doctor.full_name}")
        return reply('review',state['summary'])
    if t == '/start' and upcoming: return reply('existing','\n'.join(describe(a, contact) for a in upcoming))
    return reply('menu' if t in ['/start','salom','hello','привет','/uz','/ru','/en'] else 'unknown')
