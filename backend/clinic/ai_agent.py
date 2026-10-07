"""
AI Smart Auto-Responder & Online Booking Engine for Dental Clinics (32Desk / DentOS).

Implements:
1. Clinic Knowledge Engine (services, prices, doctors, branches, working hours).
2. NLP Natural Language Consultation (answering questions about treatments, prices, doctors).
3. Automated Appointment Booking (slot checking, collision detection, creating Appointment in DB).
4. Multi-turn dialogue management (rescheduling, constraints like "morning busy", anti-repetition).
5. Direct integration with Telegram, WhatsApp, and SMS webhooks.
"""

import re
import os
import json
import time
import datetime
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import ClinicTenant, Branch, Employee, Patient, Appointment, Workplace


# ============================================================================
# SUHBAT HOLATI (multi-turn) — bemor bilan davomli gaplashish uchun
# Har bir kontakt (telegram user id yoki telefon) bo'yicha holat saqlanadi:
#   { patient_id, name, stage, draft:{intent,date,time,doctor_hint}, last_ts }
# ============================================================================
_CONVO_FILE = os.path.join(settings.BASE_DIR, 'ai_conversations.json')


def _load_convos():
    try:
        with open(_CONVO_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        now = time.time()
        return {k: v for k, v in data.items() if now - v.get('last_ts', 0) < 86400}
    except Exception:
        return {}


def _save_convos(data):
    try:
        with open(_CONVO_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('ai convo save error:', e)


def _get_convo(key):
    return _load_convos().get(key, {})


def _set_convo(key, convo):
    data = _load_convos()
    convo['last_ts'] = time.time()
    data[key] = convo
    _save_convos(data)


def _looks_like_name(text):
    """Matn ism-familiyaga o'xshaydimi (savol yoki buyruq emas)."""
    t = (text or '').strip()
    if not (2 <= len(t) <= 60):
        return False
    if '?' in t:
        return False
    low = t.lower()
    bad = ['narx', 'qancha', 'zapis', 'qabul', 'shifokor', 'vrach', 'doktor', 'manzil',
           'qayer', 'цена', 'сколько', 'запис', 'врач', 'адрес', 'price', 'book', 'http', '@']
    if any(b in low for b in bad):
        return False
    digits = sum(ch.isdigit() for ch in t)
    if digits > 4:
        return False
    return True


def get_clinic_ai_context(clinic_id: int) -> dict:
    """Collects real-time clinic knowledge: doctors, branches, services, schedules."""
    clinic = ClinicTenant.objects.filter(id=clinic_id).first()
    if not clinic:
        return {}

    branches = list(Branch.objects.filter(clinic_id=clinic_id).values('id', 'name', 'address', 'phone', 'telegram_phone'))
    doctors = list(Employee.objects.filter(
        clinic_id=clinic_id,
        role='doctor',
        is_active=True
    ).values('id', 'full_name', 'specialty', 'phone', 'schedule', 'chair'))

    if not doctors and str(clinic_id) == '1':
        doctors = list(Employee.objects.filter(role='doctor', is_active=True).values('id', 'full_name', 'specialty', 'phone', 'schedule', 'chair'))

    settings_dict = clinic.ai_agent_settings or {}
    return {
        'clinic_id': clinic.id,
        'clinic_name': clinic.name,
        'director_name': clinic.director_name,
        'phone': clinic.phone,
        'has_ai_agent': clinic.has_ai_agent,
        'has_auto_reminders': clinic.has_auto_reminders,
        'branches': branches,
        'doctors': doctors,
        'knowledge_base': settings_dict.get('knowledge_base') or settings_dict.get('custom_prompt', ''),
        'price_list': settings_dict.get('price_list', []),
        'working_hours': settings_dict.get('working_hours', 'Dushanba-Shanba 09:00 - 19:00'),
        'greeting': settings_dict.get('greeting', ''),
    }


def check_has_date_time(text: str):
    """Matnda aniq sana yoki vaqt ko'rsatilganmi tekshiradi."""
    lower = text.lower()
    has_date = any(w in lower for w in [
        'ertaga', 'bugun', 'indin', 'dushanba', 'seshanba', 'chorshanba',
        'payshanba', 'juma', 'shanba', 'yakshanba', 'завтра', 'сегодня', 'послезавтра',
        'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
        'tomorrow', 'today', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ]) or bool(re.search(r'\b\d{1,2}[./-]\d{1,2}\b|\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b', text))

    has_time = any(w in lower for w in [
        'soat', 'obeddan keyin', 'tushdan keyin', 'kechki payt', 'kechqurun',
        'часов', 'утром', 'вечером', 'после обеда', 'afternoon', 'morning', 'evening'
    ]) or bool(re.search(r'\b(?:[01]?\d|2[0-3])[:.][0-5]\d\b|\b\d{1,2}\s*(?:da|ga|soat|часов)\b', lower))

    return has_date, has_time


def parse_date_time_request(text: str, default_date: datetime.date = None):
    """
    Extracts date and time from user natural text.
    Correctly distinguishes between dates like '05.10.2026' and times like '16:00' or 'soat 16'.
    """
    today = default_date or datetime.date.today()
    now_dt = datetime.datetime.now()
    lower = text.lower()

    # 1. Target date
    target_date = None
    if 'ertaga' in lower or 'завтра' in lower or 'tomorrow' in lower:
        target_date = today + datetime.timedelta(days=1)
    elif 'indin' in lower or 'послезавтра' in lower:
        target_date = today + datetime.timedelta(days=2)
    elif 'bugun' in lower or 'сегодня' in lower or 'today' in lower:
        target_date = today
    else:
        # Full date DD.MM.YYYY (e.g. 05.10.2026)
        m_date_full = re.search(r'\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b', text)
        if m_date_full:
            try:
                target_date = datetime.date(int(m_date_full.group(3)), int(m_date_full.group(2)), int(m_date_full.group(1)))
            except ValueError:
                pass
        else:
            # ISO date YYYY-MM-DD
            m_iso = re.search(r'\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b', text)
            if m_iso:
                try:
                    target_date = datetime.date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
                except ValueError:
                    pass
            else:
                # Weekdays
                weekdays_map = {
                    'dushanba': 0, 'seshanba': 1, 'chorshanba': 2, 'payshanba': 3, 'juma': 4, 'shanba': 5, 'yakshanba': 6,
                    'понедельник': 0, 'вторник': 1, 'среда': 2, 'четверг': 3, 'пятница': 4, 'суббота': 5, 'воскресенье': 6,
                    'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3, 'friday': 4, 'saturday': 5, 'sunday': 6
                }
                found_wd = None
                for wd_name, wd_idx in weekdays_map.items():
                    if wd_name in lower:
                        found_wd = wd_idx
                        break
                if found_wd is not None:
                    days_ahead = (found_wd - today.weekday()) % 7
                    if days_ahead == 0:
                        days_ahead = 7
                    target_date = today + datetime.timedelta(days=days_ahead)
                else:
                    # Short date DD.MM
                    m_short = re.search(r'\b(\d{1,2})[./-](\d{1,2})\b', text)
                    if m_short:
                        try:
                            target_date = datetime.date(today.year, int(m_short.group(2)), int(m_short.group(1)))
                        except ValueError:
                            pass

    # 2. Target time
    # Strip any full dates first so '05.10.2026' is never mistaken as 05:10!
    text_no_date = re.sub(r'\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b', ' ', text)
    lower_no_date = text_no_date.lower()

    time_str = '15:00'
    m_hour_explicit = re.search(r'(?:soat|в|at)\s*([01]?\d|2[0-3])(?::([0-5]\d))?\b', lower_no_date)
    if m_hour_explicit:
        h = int(m_hour_explicit.group(1))
        m = int(m_hour_explicit.group(2) or 0)
        if 1 <= h <= 7:
            h += 12
        time_str = f"{h:02d}:{m:02d}"
    else:
        m_time = re.search(r'\b([01]?\d|2[0-3]):([0-5]\d)\b', text_no_date)
        if m_time:
            h = int(m_time.group(1))
            m = int(m_time.group(2))
            if 1 <= h <= 7:
                h += 12
            time_str = f"{h:02d}:{m:02d}"
        else:
            m_hour = re.search(r'\b(\d{1,2})\s*(?:da|ga|часов)\b', lower_no_date)
            if m_hour:
                h = int(m_hour.group(1))
                if 1 <= h <= 7:
                    h += 12
                if 8 <= h <= 20:
                    time_str = f"{h:02d}:00"
            elif 'obeddan keyin' in lower or 'tushdan keyin' in lower or 'после обеда' in lower:
                time_str = '15:00'
            elif 'kechki payt' in lower or 'kechqurun' in lower or 'вечером' in lower:
                time_str = '17:30'
            elif 'ertalab' in lower or 'утром' in lower or 'morning' in lower:
                time_str = '10:00'

    # If target_date wasn't explicitly stated:
    if target_date is None:
        try:
            h_req, m_req = map(int, time_str.split(':'))
            if today == now_dt.date() and (now_dt.hour > h_req or (now_dt.hour == h_req and now_dt.minute >= m_req)):
                target_date = today + datetime.timedelta(days=1)
            else:
                target_date = today
        except Exception:
            target_date = today

    return target_date, time_str


def _do_booking(clinic, patient, raw, lang, doctors):
    """Bemor (patient) uchun matndan sana/vaqt/shifokorni aniqlab zapis yaratadi."""
    clinic_id = clinic.id
    lower = raw.lower()
    target_date, target_time = parse_date_time_request(raw)
    hour, minute = map(int, target_time.split(':'))
    start_dt = datetime.datetime.combine(target_date, datetime.time(hour, minute))
    end_dt = start_dt + datetime.timedelta(minutes=45)

    chosen_doctor = None
    for d in doctors:
        last_name = d['full_name'].split()[-1].lower() if d['full_name'] else ''
        first_name = d['full_name'].split()[0].lower() if d['full_name'] else ''
        if (last_name and last_name in lower) or (first_name and first_name in lower):
            chosen_doctor = Employee.objects.filter(id=d['id']).first()
            break
    if not chosen_doctor and doctors:
        chosen_doctor = Employee.objects.filter(id=doctors[0]['id']).first()

    if not chosen_doctor:
        if lang == 'ru':
            reply = f"Чтобы записать вас, уточните врача. Или наш администратор свяжется с вами: {clinic.phone or ''}"
        elif lang == 'en':
            reply = f"To book your visit, please specify a doctor, or our administrator will contact you: {clinic.phone or ''}"
        else:
            reply = f"Sizni yozib qo'yishimiz uchun qaysi shifokorga yozilishni xohlaysiz? Yoki administratorimiz bog'lanadi: {clinic.phone or ''}"
        return {'ok': True, 'action': 'need_doctor', 'reply': reply}

    collision = Appointment.objects.filter(
        clinic_id=clinic_id, doctor=chosen_doctor,
        start_time__lt=end_dt, end_time__gt=start_dt,
        status__in=['new', 'confirmed', 'in_progress', 'late']
    ).exists()
    if collision:
        alt_dt = start_dt + datetime.timedelta(hours=1)
        alt_time_str = alt_dt.strftime('%H:%M')
        if lang == 'ru':
            reply = f"К сожалению, {target_time} у доктора {chosen_doctor.full_name} занято. Можем предложить {alt_time_str} ({target_date.strftime('%d.%m.%Y')}). Записать вас?"
        elif lang == 'en':
            reply = f"Unfortunately, {target_time} is booked for Dr. {chosen_doctor.full_name}. We have {alt_time_str} on {target_date.strftime('%Y-%m-%d')}. Book it?"
        else:
            reply = f"Afsuski, soat {target_time} da {chosen_doctor.full_name} shifokorda qabul bor. Sizga soat {alt_time_str} ({target_date.strftime('%d.%m.%Y')}) vaqtini taklif qilamiz. Shu vaqtga yozib qo'yaylikmi?"
        return {'ok': True, 'action': 'collision_suggested_alt', 'reply': reply}

    branch_obj = chosen_doctor.branch if (chosen_doctor and chosen_doctor.branch) else Branch.objects.filter(clinic_id=clinic_id).first()
    new_apt = Appointment.objects.create(
        clinic_id=clinic_id, patient=patient, doctor=chosen_doctor, branch=branch_obj,
        start_time=start_dt, end_time=end_dt, status='confirmed', color_code='#06B6D4',
        chair_name=chosen_doctor.chair or 'Кресло 1',
        treatment_notes=f"AI administrator orqali onlayn yozildi. Xabar: {raw[:120]}"
    )
    doc_name = chosen_doctor.full_name
    date_display = target_date.strftime('%d.%m.%Y')
    addr = branch_obj.address if branch_obj else clinic.branch
    fn = (patient.full_name or '').split()[0] if patient and patient.full_name else ''

    if lang == 'ru':
        reply = (
            f"✅ {fn}, вы успешно записаны в клинику {clinic.name}!\n\n"
            f"📅 Дата: {date_display}\n"
            f"⏰ Время: {target_time}\n"
            f"👨‍⚕️ Врач: {doc_name}\n"
            f"📍 Адрес: {addr}\n\n"
            f"Ждём вас! Если планы изменятся — просто напишите нам."
        )
    elif lang == 'en':
        reply = (
            f"✅ {fn}, your appointment at {clinic.name} is confirmed!\n\n"
            f"📅 Date: {date_display}\n"
            f"⏰ Time: {target_time}\n"
            f"👨‍⚕️ Doctor: {doc_name}\n"
            f"📍 Address: {addr}\n\n"
            f"See you soon! Please let us know if your plans change."
        )
    else:
        reply = (
            f"✅ {fn}, siz muvaffaqiyatli qabulga yozildingiz!\n\n"
            f"🏥 Klinika: {clinic.name}\n"
            f"📅 Sana: {date_display}\n"
            f"⏰ Vaqt: soat {target_time}\n"
            f"👨‍⚕️ Shifokor: {doc_name}\n"
            f"📍 Manzil: {addr}\n\n"
            f"Sizni kutib qolamiz! Agar rejangiz o'zgarsa, oldindan xabar bering."
        )
    return {
        'ok': True, 'action': 'appointment_created', 'reply': reply,
        'appointment_id': new_apt.id, 'date': date_display, 'time': target_time, 'doctor': doc_name
    }


def _reschedule_appointment(clinic, patient, raw, lang, doctors, apt_id=None):
    """Mavjud qabulni yangi sana va vaqtga ko'chiradi."""
    clinic_id = clinic.id
    target_apt = None
    if apt_id:
        target_apt = Appointment.objects.filter(id=apt_id, patient=patient).first()
    if not target_apt:
        target_apt = Appointment.objects.filter(patient=patient, clinic_id=clinic_id).order_by('-id').first()

    if not target_apt:
        return _do_booking(clinic, patient, raw, lang, doctors)

    target_date, target_time = parse_date_time_request(raw)
    hour, minute = map(int, target_time.split(':'))
    start_dt = datetime.datetime.combine(target_date, datetime.time(hour, minute))
    end_dt = start_dt + datetime.timedelta(minutes=45)

    doc = target_apt.doctor or (Employee.objects.filter(id=doctors[0]['id']).first() if doctors else None)

    if doc:
        collision = Appointment.objects.filter(
            clinic_id=clinic_id, doctor=doc,
            start_time__lt=end_dt, end_time__gt=start_dt,
            status__in=['new', 'confirmed', 'in_progress', 'late']
        ).exclude(id=target_apt.id).exists()
        if collision:
            alt_dt = start_dt + datetime.timedelta(hours=1)
            alt_time_str = alt_dt.strftime('%H:%M')
            if lang == 'ru':
                reply = f"К сожалению, {target_time} у доктора {doc.full_name} занято. Можем перенести на {alt_time_str} ({target_date.strftime('%d.%m.%Y')}). Подойдёт?"
            elif lang == 'en':
                reply = f"Unfortunately, {target_time} is booked for Dr. {doc.full_name}. We have an opening at {alt_time_str} on {target_date.strftime('%Y-%m-%d')}. Would you like that?"
            else:
                reply = f"Afsuski, soat {target_time} da {doc.full_name} band. Sizga soat {alt_time_str} ({target_date.strftime('%d.%m.%Y')}) vaqtini taklif qilamiz. Shu vaqtga ko'chiraylikmi?"
            return {'ok': True, 'action': 'collision_suggested_alt', 'reply': reply}

    target_apt.start_time = start_dt
    target_apt.end_time = end_dt
    target_apt.status = 'confirmed'
    target_apt.color_code = '#06B6D4'
    old_notes = target_apt.treatment_notes or ''
    target_apt.treatment_notes = f"{old_notes} [AI ko'chirdi: {start_dt.strftime('%d.%m.%Y %H:%M')}]".strip()
    target_apt.save()

    doc_name = doc.full_name if doc else 'Shifokor'
    date_display = target_date.strftime('%d.%m.%Y')
    branch_obj = target_apt.branch or Branch.objects.filter(clinic_id=clinic_id).first()
    addr = branch_obj.address if branch_obj else clinic.branch
    fn = (patient.full_name or '').split()[0] if patient and patient.full_name else ''

    if lang == 'ru':
        reply = (
            f"✅ {fn}, ваш приём успешно перенесён!\n\n"
            f"📅 Новая дата: {date_display}\n"
            f"⏰ Время: {target_time}\n"
            f"👨‍⚕️ Врач: {doc_name}\n"
            f"📍 Адрес: {addr}\n\n"
            f"Ждём вас! Если возникнут вопросы — мы на связи."
        )
    elif lang == 'en':
        reply = (
            f"✅ {fn}, your appointment has been rescheduled!\n\n"
            f"📅 New date: {date_display}\n"
            f"⏰ Time: {target_time}\n"
            f"👨‍⚕️ Doctor: {doc_name}\n"
            f"📍 Address: {addr}\n\n"
            f"See you then!"
        )
    else:
        reply = (
            f"✅ {fn}, qabulingiz muvaffaqiyatli yangi vaqtga ko'chirildi!\n\n"
            f"📅 Yangi sana: {date_display}\n"
            f"⏰ Yangi vaqt: soat {target_time}\n"
            f"👨‍⚕️ Shifokor: {doc_name}\n"
            f"📍 Manzil: {addr}\n\n"
            f"Sizni kutib qolamiz!"
        )
    return {
        'ok': True, 'action': 'rescheduled', 'reply': reply,
        'appointment_id': target_apt.id, 'date': date_display, 'time': target_time, 'doctor': doc_name
    }


def process_ai_inbound_message(clinic_id: int, phone: str, text: str, patient_name: str = None, contact_key: str = None) -> dict:
    """
    Core AI Consultant & Booking agent with human-like multi-turn context.
    Understands:
    - User frustration & repetition ("nima bitta gapni qaytarib yotibsan") -> apologizes and asks directly for new time.
    - Time constraints ("ertalab band bo'laman") -> suggests afternoon slots (14:00, 15:30, 16:30, 17:30).
    - Rescheduling requests ("sanani o'zgartirmoqchiman") -> reschedules or prompts for preferred slot.
    - Booking requests ("menu ko'rigiga yozib qo'ya olasizmi") -> asks for date/time instead of blind booking!
    - General questions about prices, doctors, branches.
    """
    from .reminders import detect_intent, detect_language_from_text, process_patient_reply

    raw = (text or '').strip()
    clean_phone = ''.join(ch for ch in (phone or '') if ch.isdigit())
    lang = detect_language_from_text(raw) or 'uz'
    intent = detect_intent(raw)

    clinic = ClinicTenant.objects.filter(id=clinic_id).first()
    if not clinic:
        return {'ok': False, 'message': 'Klinika topilmadi'}

    ctx = get_clinic_ai_context(clinic_id)
    doctors = ctx.get('doctors', [])
    branches = ctx.get('branches', [])
    kb = (ctx.get('knowledge_base') or '').strip()
    custom_prices = ctx.get('price_list') or []
    working_hours = ctx.get('working_hours') or 'Dushanba-Shanba 09:00 - 19:00'

    key = contact_key or (f"ph:{clean_phone}" if clean_phone else phone) or "anon"
    convo = _get_convo(key)
    lower = raw.lower()

    # Bemor profilini topish
    patient = None
    if convo.get('patient_id'):
        patient = Patient.objects.filter(id=convo['patient_id'], clinic_id=clinic_id).first()
    if not patient and clean_phone:
        patient = Patient.objects.filter(clinic_id=clinic_id, phone__icontains=clean_phone[-9:]).first()
    if not patient and patient_name and _looks_like_name(patient_name):
        patient = Patient.objects.filter(clinic_id=clinic_id, full_name__icontains=patient_name.strip()).first()
    if patient:
        convo['patient_id'] = patient.id

    fn = (patient.full_name.split()[0] if patient and patient.full_name else 'Hurmatli bemor')
    has_date, has_time = check_has_date_time(raw)
    current_stage = convo.get('stage', '')

    active_apt = None
    if patient:
        active_apt = Appointment.objects.filter(
            clinic_id=clinic_id, patient=patient,
            status__in=['new', 'confirmed', 'reserved', 'in_progress', 'late']
        ).order_by('-start_time').first()

    # =========================================================================
    # 0. FRUSTRATION / REPETITION DETECTION ("Nima bitta gapni qaytarib yotibsan")
    # =========================================================================
    is_frustrated = bool(re.search(
        r"(?:bitta\s+(?:so['`]?z|gap)|qaytarib|robot|botmisan|eshityapsanmi|tushunmayapsan|nima\s+bitta|g['`]alati|gapimni|tushunmading|nega\s+bitta)",
        lower
    ))
    if is_frustrated:
        convo['stage'] = 'awaiting_reschedule_time'
        _set_convo(key, convo)
        if active_apt:
            apt_time_str = active_apt.start_time.strftime('%H:%M')
            if lang == 'ru':
                reply = f"Простите меня, {fn}! Я вас прекрасно понял. Давайте изменим время вашей записи (сейчас стоит на {apt_time_str}). Напишите, пожалуйста, какой день и час вам удобны (например: завтра в 16:00), и я сразу обновлю."
            elif lang == 'en':
                reply = f"My apologies, {fn}! I understand you completely. Let us change your appointment (currently at {apt_time_str}). Which date and time work best for you (for example: tomorrow at 16:00)?"
            else:
                reply = f"Kechirasiz, {fn}! Sizni juda yaxshi tushundim, noqulaylik uchun uzr so'rayman. Hozirgi qabulingiz vaqtini (soat {apt_time_str} da belgilangan) yangi vaqtga ko'chirib bermoqchiman. Menga o'zingizga qulay kun va soatni aytsangiz (masalan: ertaga soat 16:00 ga), darhol yangilab beraman!"
        else:
            if lang == 'ru':
                reply = f"Простите, {fn}! Я вас понял. На какой день и время вы хотите записаться? Напишите (например: завтра в 16:00), и я сразу запишу."
            elif lang == 'en':
                reply = f"I apologize, {fn}! I understand. What day and time would you like to schedule? Let me know (e.g. tomorrow at 16:00), and I will book it."
            else:
                reply = f"Kechirasiz, {fn}! Sizni to'g'ri tushundim. Menga qaysi kun va soat qulayligini yozib bersangiz (masalan: ertaga soat 16:00 ga), darhol yozib qo'yaman."
        return {'ok': True, 'action': 'apology_ask_time', 'reply': reply}

    # =========================================================================
    # 1. TIME PREFERENCES / CONSTRAINTS ("Ertalab band bo'laman", "tushdan keyin")
    # =========================================================================
    is_morning_busy = bool(re.search(
        r"(?:ertalab|ertablab)\s+(?:band|bo['`]?sh\s+emas|kelolmayman|bo['`]?lmayman)|kelolmayman\s+ertalab|утром\s+занят|утром\s+не\s+могу|busy\s+in\s+the\s+morning",
        lower
    ))
    is_afternoon_pref = bool(re.search(
        r"tushdan\s+keyin|obeddan\s+keyin|kechki\s+payt|kechqurun|после\s+обеда|вечером|afternoon|evening",
        lower
    ))

    if is_morning_busy or is_afternoon_pref:
        convo['stage'] = 'awaiting_reschedule_time'
        convo['draft'] = {'intent': 'reschedule', 'pref': 'afternoon'}
        _set_convo(key, convo)
        if lang == 'ru':
            reply = (
                f"Понял вас, {fn}! Если утром вам неудобно, во второй половине дня свободны следующие часы:\n"
                f"• 14:00\n• 15:30\n• 16:30\n• 17:30\n• 18:00\n\n"
                f"Какое время вам удобнее на завтра? Напишите, и я сразу перенесу запись."
            )
        elif lang == 'en':
            reply = (
                f"Understood, {fn}! In the afternoon, we have open slots at:\n"
                f"• 14:00\n• 15:30\n• 16:30\n• 17:30\n• 18:00\n\n"
                f"Which time works best for you for tomorrow?"
            )
        else:
            reply = (
                f"Tushunarli, {fn}! Ertalab band bo'lsangiz, tushdan keyingi qulay bo'sh vaqtlarimiz:\n"
                f"• Soat 14:00\n• Soat 15:30\n• Soat 16:30\n• Soat 17:30\n• Soat 18:00\n\n"
                f"Ertaga shu soatlardan qaysi biri sizga ma'qul? Yozib yuborsangiz, qabulingizni darhol shu vaqtga ko'chirib beraman."
            )
        return {'ok': True, 'action': 'afternoon_slots_suggested', 'reply': reply}

    # =========================================================================
    # 2. STAGE: AWAITING RESCHEDULE TIME
    # =========================================================================
    if current_stage == 'awaiting_reschedule_time' and patient:
        if has_time or has_date:
            convo['stage'] = ''
            convo['draft'] = {}
            _set_convo(key, convo)
            return _reschedule_appointment(clinic, patient, raw, lang, doctors)
        convo['stage'] = 'awaiting_reschedule_time'
        _set_convo(key, convo)
        if lang == 'ru':
            reply = f"{fn}, пожалуйста, напишите точный час (например: в 16:00 или 17:30), и я сразу обновлю запись."
        elif lang == 'en':
            reply = f"{fn}, please let me know your preferred hour (for example: 16:00 or 17:30), and I will update your visit."
        else:
            reply = f"{fn}, iltimos o'zingizga qulay soatni yozib yuboring (masalan: 16:00 yoki 17:30 ga), darhol qabulingizni yangilab beraman."
        return {'ok': True, 'action': 'ask_time_again', 'reply': reply}

    # =========================================================================
    # 3. RESCHEDULE INTENT ("Sanani o'zgartirmoqchiman", "Boshqa kunga ko'chiraylik")
    # =========================================================================
    is_reschedule_text = (intent == 'reschedule') or bool(re.search(
        r"(?:o['`]?zgartir|almashtir|ko['`]?chir|boshqa\s+(?:kunga|vaqtga|soatga|payt)|sanani|vaqtini|ertaga\s+emas|перенести|изменить\s+время|другой\s+день)",
        lower
    ))
    if is_reschedule_text:
        if has_time or has_date:
            convo['stage'] = ''
            _set_convo(key, convo)
            return _reschedule_appointment(clinic, patient, raw, lang, doctors)
        convo['stage'] = 'awaiting_reschedule_time'
        _set_convo(key, convo)
        if lang == 'ru':
            reply = f"Конечно, {fn}! Мы с радостью изменим время вашего приёма. Какой новый день и час вам удобны? (Например: завтра в 16:00 или в понедельник в 11:00)."
        elif lang == 'en':
            reply = f"Of course, {fn}! We can reschedule your appointment. What new date and time would you prefer? (For example: tomorrow at 16:00 or Monday at 11:00)."
        else:
            reply = f"Albatta, {fn}! Hozirgi qabulingiz vaqtini mamnuniyat bilan o'zgartirib beraman. Yangi qaysi kun va soat sizga qulay bo'ladi? (Masalan: ertaga soat 16:00 ga yoki dushanba soat 11:00 ga)."
        return {'ok': True, 'action': 'ask_reschedule_time', 'reply': reply}

    # =========================================================================
    # 4. CONFIRM / CANCEL / LATE NOTIFICATIONS
    # =========================================================================
    if intent in ('confirm', 'cancel', 'late'):
        reminder_res = process_patient_reply(clean_phone, raw)
        if reminder_res.get('action_taken') in ('status_updated', 'flagged_for_reschedule'):
            return {
                'ok': True,
                'action': reminder_res.get('action_taken'),
                'intent': intent,
                'reply': reminder_res.get('reply_message', ''),
                'appointment_id': reminder_res.get('appointment_id'),
                'new_status': reminder_res.get('new_status')
            }

    # =========================================================================
    # 5. STAGE: AWAITING NAME (Yangi bemor ismini kiritishi)
    # =========================================================================
    if current_stage == 'awaiting_name' and not patient:
        candidate_name = re.sub(r'^(?:mening\s+ismim|ismim|men)\s+', '', raw.strip(), flags=re.IGNORECASE).strip()
        if _looks_like_name(candidate_name):
            patient = Patient.objects.create(
                clinic_id=clinic_id, full_name=candidate_name,
                phone=phone or '', service_lang=lang, category_status='Yangi'
            )
            convo['patient_id'] = patient.id
            fn = candidate_name.split()[0]
            draft = convo.get('draft') or {}
            combined_text = (draft.get('raw', '') + ' ' + raw).strip()
            d_has_date, d_has_time = check_has_date_time(combined_text)

            if draft.get('intent') == 'booking' and d_has_date and d_has_time:
                convo['stage'] = ''
                convo['draft'] = {}
                _set_convo(key, convo)
                return _do_booking(clinic, patient, combined_text, lang, doctors)

            convo['stage'] = 'awaiting_booking_time'
            convo['draft'] = {'intent': 'booking', 'raw': draft.get('raw', '')}
            _set_convo(key, convo)
            if lang == 'ru':
                reply = f"Спасибо, {fn}! Я записал ваши данные. 😊 На какой день и время вам удобно прийти на приём? (Например: завтра в 15:00 или в понедельник в 10:00)."
            elif lang == 'en':
                reply = f"Thank you, {fn}! You are registered. 😊 What day and time works best for your appointment? (For example: tomorrow at 15:00 or Monday at 10:00)."
            else:
                reply = f"Rahmat, {fn}! Sizni ro'yxatga oldim. 😊 Qaysi kun va soatga qabulga yozib qo'yaylik? (Masalan: ertaga soat 15:00 ga yoki dushanba kuni soat 10:00 ga)."
            return {'ok': True, 'action': 'registered_ask_time', 'reply': reply}

    # =========================================================================
    # 6. STAGE: AWAITING BOOKING TIME (Yangi zapis uchun vaqt kutilmoqda)
    # =========================================================================
    if current_stage == 'awaiting_booking_time' and patient:
        if has_time or has_date:
            convo['stage'] = ''
            draft = convo.get('draft') or {}
            combined_text = (draft.get('raw', '') + ' ' + raw).strip()
            convo['draft'] = {}
            _set_convo(key, convo)
            return _do_booking(clinic, patient, combined_text, lang, doctors)
        if lang == 'ru':
            reply = f"{fn}, уточните, пожалуйста, удобное время (например: завтра в 15:00), и я запишу вас."
        elif lang == 'en':
            reply = f"{fn}, please specify your preferred time (for example: tomorrow at 15:00), and I will book it."
        else:
            reply = f"{fn}, qaysi kun va soat sizga qulayligini aytsangiz (masalan: ertaga soat 15:00 ga), darhol yozib qo'yaman."
        return {'ok': True, 'action': 'ask_time_again', 'reply': reply}

    # =========================================================================
    # 7. BOOKING INTENT ("Zapisga yozmoqchiman", "Menu ko'rigiga yozib qo'ya olasizmi")
    # =========================================================================
    is_booking_request = any(w in lower for w in [
        'zapis', "yozib qo'y", 'yozing', 'yozilmoqchiman', 'qabulga', 'navbatga',
        "ko'rigiga", "ko'rikka", 'korik', 'запишите', 'записаться', 'хочу на прием', 'запись', 'book', 'appointment'
    ])

    if is_booking_request:
        if not patient:
            convo['stage'] = 'awaiting_name'
            convo['draft'] = {'intent': 'booking', 'raw': raw}
            _set_convo(key, convo)
            if lang == 'ru':
                reply = "Уважаемый пациент, чтобы записать вас на приём, пожалуйста, напишите ваше имя и фамилию."
            elif lang == 'en':
                reply = "Dear patient, to book an appointment please share your full name first."
            else:
                reply = "Hurmatli bemor, sizni qabulga yozishimiz uchun avval ism-familiyangizni yozib yuboring. Keyin qulay sana va vaqtni tanlaymiz."
            return {'ok': True, 'action': 'ask_name', 'reply': reply}

        # Bemor ma'lum — sana va vaqt aytilganmi tekshiramiz
        if has_time and has_date:
            convo['stage'] = ''
            _set_convo(key, convo)
            return _do_booking(clinic, patient, raw, lang, doctors)

        # Sana/vaqt aytilmagan bo'lsa — SO'RAYMIZ, o'zimizdan 10:00 qilib yozmaymiz!
        convo['stage'] = 'awaiting_booking_time'
        convo['draft'] = {'intent': 'booking', 'raw': raw}
        _set_convo(key, convo)
        if lang == 'ru':
            reply = f"Конечно, {fn}! На какой день и время вас записать? (Например: завтра в 15:00 или в понедельник в 11:00). К какому врачу желаете?"
        elif lang == 'en':
            reply = f"Certainly, {fn}! What day and time would you like to book? (For example: tomorrow at 15:00 or Monday at 11:00). Do you have a preferred doctor?"
        else:
            reply = f"Albatta, {fn}! Sizga qaysi kun va soat qulay bo'ladi? (Masalan: ertaga soat 15:00 ga yoki dushanba kuni 11:00 ga). Qaysi shifokorimiz qabuliga yozilishni xohlaysiz?"
        return {'ok': True, 'action': 'ask_time', 'reply': reply}

    # =========================================================================
    # 8. PRICE / SERVICE QUESTIONS
    # =========================================================================
    is_price_query = any(w in lower for w in [
        'narx', 'qancha', 'narxi', 'plomba', 'oqartirish', 'implant', 'breket', 'narxlari',
        'цена', 'сколько стоит', 'прайс', 'стоимость', 'пломба', 'отбеливание', 'имплант',
        'price', 'how much', 'cost'
    ])
    if is_price_query:
        convo['stage'] = ''
        _set_convo(key, convo)
        if custom_prices:
            lines = []
            for item in custom_prices[:12]:
                svc = item.get('service') or item.get('name') or ''
                prc = item.get('price') or ''
                if svc:
                    lines.append(f"• {svc}: {prc}")
            price_text = "\n".join(lines)
            if lang == 'ru':
                reply = f"В клинике {clinic.name} действуют следующие цены:\n{price_text}\n\nЖелаете записаться на приём?"
            elif lang == 'en':
                reply = f"At {clinic.name}, our prices are:\n{price_text}\n\nWould you like to book an appointment?"
            else:
                reply = f"{clinic.name} klinikasida xizmat narxlari:\n{price_text}\n\nQabulga yozilishni xohlaysizmi?"
            return {'ok': True, 'action': 'price_consultation', 'reply': reply}
        if lang == 'ru':
            reply = (
                f"Здравствуйте, {fn}! В клинике {clinic.name} действуют следующие базовые цены на популярные услуги:\n"
                f"• Консультация и диагностика: Бесплатно / 50 000 UZS\n"
                f"• Световая пломба (Estelite / Filtek): от 350 000 UZS\n"
                f"• Профессиональная чистка (Ультразвук + Air Flow): от 500 000 UZS\n"
                f"• Циркониевая коронка (CAD/CAM): от 1 800 000 UZS\n"
                f"• Имплантация зубов (Osstem / Dentium): от 4 200 000 UZS\n\n"
                f"Желаете записаться на консультацию к нашему специалисту для точного расчёта?"
            )
        elif lang == 'en':
            reply = (
                f"Hello, {fn}! At {clinic.name}, our indicative treatment prices are:\n"
                f"• Consultation & Diagnosis: Free / 50 000 UZS\n"
                f"• Composite filling (Estelite / Filtek): from 350 000 UZS\n"
                f"• Professional oral hygiene (Air Flow): from 500 000 UZS\n"
                f"• Zirconia crown (CAD/CAM): from 1 800 000 UZS\n"
                f"• Dental Implant (Osstem / Dentium): from 4 200 000 UZS\n\n"
                f"Would you like to book a consultation with one of our doctors?"
            )
        else:
            reply = (
                f"Assalomu alaykum, {fn}! {clinic.name} klinikasida xizmatlarning taxminiy narxlari:\n"
                f"• Boshlang‘ich konsultatsiya va ko‘rik: Bepul\n"
                f"• Nurli fotopolimer plomba (Estelite / Filtek): 350 000 UZS dan\n"
                f"• Kompleks professional tozalash (Ultratovush + Air Flow): 500 000 UZS dan\n"
                f"• Sirkoniy toj (CAD/CAM monolit): 1 800 000 UZS dan\n"
                f"• Tish implantatsiyasi (Osstem / Dentium): 4 200 000 UZS dan\n\n"
                f"Aniq narx va davolash rejasini bilish uchun qabulga yozilishni xohlaysizmi?"
            )
        return {'ok': True, 'action': 'price_consultation', 'reply': reply}

    # =========================================================================
    # 9. DOCTOR QUESTIONS
    # =========================================================================
    is_doctor_query = any(w in lower for w in [
        'shifokor', 'vrach', 'doktor', 'kim ishlaydi', 'mutaxassis', 'ish vaqti',
        'врач', 'доктора', 'кто работает', 'специалист', 'график', 'расписание',
        'doctor', 'dentist', 'schedule'
    ])
    if is_doctor_query:
        doc_list_text = ""
        for d in doctors[:4]:
            doc_list_text += f"\n• {d['full_name']} — {d.get('specialty', 'Stomatolog')} ({d.get('schedule', '09:00 - 18:00')})"
        if not doc_list_text:
            doc_list_text = "\n• Dr. Sardor Alimov — Bosh stomatolog-terapevt (09:00 - 18:00)"

        if lang == 'ru':
            reply = (f"В клинике {clinic.name} ведут приём квалифицированные специалисты:{doc_list_text}\n\n"
                     f"На какой день и время вы хотите записаться к доктору?")
        elif lang == 'en':
            reply = (f"Our clinical specialists at {clinic.name}:{doc_list_text}\n\n"
                     f"Which day and time would you like to book with our doctor?")
        else:
            reply = (f"{clinic.name} klinikasida faoliyat yurituvchi shifokorlarimiz:{doc_list_text}\n\n"
                     f"Qaysi shifokorimiz qabuliga yozilmoqchisiz? Kun va vaqtini aytsangiz, yozib qo‘yamiz.")
        return {'ok': True, 'action': 'doctor_info', 'reply': reply}

    # =========================================================================
    # 10. LOCATION / HOURS
    # =========================================================================
    is_location_query = any(w in lower for w in [
        'qayerda', 'manzil', 'lokatsiya', 'telefon', 'ishlaysiz',
        'где вы', 'адрес', 'локация', 'где находитесь', 'телефон', 'время работы',
        'where', 'address', 'location'
    ])
    if is_location_query:
        b = branches[0] if branches else None
        addr = b['address'] if b else clinic.branch
        phone_num = clinic.phone or (b['phone'] if b else '+998 71 200 00 32')
        if lang == 'ru':
            reply = (f"🏥 Клиника {clinic.name}\n📍 Адрес: {addr}\n⏰ Режим работы: {working_hours}\n📞 Телефон: {phone_num}\n\n"
                     f"Будем рады видеть вас! Хотите записаться на консультацию?")
        elif lang == 'en':
            reply = (f"🏥 {clinic.name}\n📍 Address: {addr}\n⏰ Hours: {working_hours}\n📞 Phone: {phone_num}\n\n"
                     f"We look forward to welcoming you! Would you like to book a visit?")
        else:
            reply = (f"🏥 {clinic.name} klinikasi\n📍 Manzil: {addr}\n⏰ Ish vaqti: {working_hours}\n📞 Telefon: {phone_num}\n\n"
                     f"Sizni kutib qolamiz! Shifokor ko‘rigiga yozilmoqchimisiz?")
        return {'ok': True, 'action': 'location_info', 'reply': reply}

    # =========================================================================
    # 11. GENERAL GREETING (Bir xil salomlashish takrorlanmasligi uchun!)
    # =========================================================================
    is_explicit_greeting = any(w in lower for w in [
        'salom', 'assalom', 'privet', 'hello', 'hi', 'xayrli', 'здравствуй', 'привет'
    ])

    now_ts = time.time()
    last_interaction = convo.get('last_ts', 0)
    is_recent_convo = (now_ts - last_interaction < 1800)

    convo['last_ts'] = now_ts
    _set_convo(key, convo)

    # Agar allaqachon suhbat ketayotgan bo'lsa va xabar "salom" bo'lmasa — ROBOT SALOMLASHUVI QAYTARILMAYDI!
    if is_recent_convo and not is_explicit_greeting:
        if lang == 'ru':
            reply = f"Я на связи, {fn}! Чем могу помочь — записать вас на приём или ответить на вопросы?"
        elif lang == 'en':
            reply = f"I am here to help, {fn}! Would you like to book an appointment or ask a question?"
        else:
            reply = f"Eshitaman, {fn}! Sizga qanday yordam bera olaman — qabulga yozilishmi yoki boshqa savolingiz bormi?"
        return {'ok': True, 'action': 'brief_reply', 'reply': reply}

    # Birinchi salomlashuv
    if patient and fn != 'Hurmatli bemor':
        if lang == 'ru':
            reply = f"Здравствуйте, {fn}! Вас приветствует AI-администратор клиники {clinic.name}. 😊\nЧем могу вам помочь — записать на приём, подсказать цены или врача?"
        elif lang == 'en':
            reply = f"Hello, {fn}! Welcome to {clinic.name} AI Assistant. 😊\nHow can I help you — book an appointment, check prices, or find a doctor?"
        else:
            reply = f"Assalomu alaykum, {fn}! {clinic.name} klinikasining sun'iy intellektli administratori xizmatingizda. 😊\nSizga qanday yordam bera olaman — shifokor ko'rigiga yozilishmi yoki narxlar haqida ma'lumot beraymi?"
    else:
        if lang == 'ru':
            reply = f"Здравствуйте, уважаемый пациент! Вас приветствует AI-администратор клиники {clinic.name}. 😊\nЧем могу помочь — записать вас на приём или подсказать цены?"
        elif lang == 'en':
            reply = f"Hello, dear patient! Welcome to {clinic.name} AI Assistant. 😊\nHow may I help you — book a visit or share our service prices?"
        else:
            reply = f"Assalomu alaykum, hurmatli bemor! {clinic.name} klinikasining sun'iy intellektli administratori xizmatingizda. 😊\nMen sizga xizmatlarimiz narxi, shifokorlarimiz haqida ma'lumot berishim yoki sizni qulay vaqtga qabulga yozib qo‘yishim mumkin. Sizga qanday yordam bera olaman?"

    return {'ok': True, 'action': 'general_greeting', 'reply': reply}


# ============================================================================
# API ENDPOINTS
# ============================================================================

@api_view(['POST'])
@permission_classes([AllowAny])
def ai_chat_message(request):
    """
    Simulates or handles an inbound chat message from patient (Telegram, WhatsApp, Web).
    Executes AI consultant reasoning, auto-replies, and creates appointment if requested.
    """
    clinic_id = request.data.get('clinic_id') or request.headers.get('X-Clinic-ID') or 1
    try:
        clinic_id = int(clinic_id)
    except (ValueError, TypeError):
        clinic_id = 1

    phone = request.data.get('phone', '+998 90 123 45 67')
    message = request.data.get('message', '')
    patient_name = request.data.get('patient_name')
    # Suhbat holatini ushlab turish uchun kalit (web simulyator ko'p martalik suhbatni test qilsin)
    contact_key = request.data.get('contact_key') or (f"ph:{''.join(ch for ch in phone if ch.isdigit())}" if phone else None)

    result = process_ai_inbound_message(clinic_id, phone, message, patient_name, contact_key)
    return Response(result)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def ai_agent_settings(request):
    """
    GET: returns clinic settings (has_ai_agent, has_auto_reminders, ai_agent_settings).
    POST: updates them.
    """
    clinic_id = request.query_params.get('clinic') or request.headers.get('X-Clinic-ID') or 1
    try:
        clinic_id = int(clinic_id)
    except (ValueError, TypeError):
        clinic_id = 1

    clinic = ClinicTenant.objects.filter(id=clinic_id).first()
    if not clinic:
        return Response({'ok': False, 'message': 'Clinic not found'}, status=404)

    if request.method == 'GET':
        ctx = get_clinic_ai_context(clinic_id)
        return Response({
            'ok': True,
            'clinic_id': clinic.id,
            'has_ai_agent': clinic.has_ai_agent,
            'has_auto_reminders': clinic.has_auto_reminders,
            'ai_agent_settings': clinic.ai_agent_settings or {},
            'context': ctx
        })

    # POST
    data = request.data
    if 'has_ai_agent' in data:
        clinic.has_ai_agent = bool(data['has_ai_agent'])
    if 'has_auto_reminders' in data:
        clinic.has_auto_reminders = bool(data['has_auto_reminders'])
    if 'ai_agent_settings' in data:
        curr = clinic.ai_agent_settings or {}
        if isinstance(data['ai_agent_settings'], dict):
            curr.update(data['ai_agent_settings'])
        clinic.ai_agent_settings = curr
    clinic.save()

    return Response({
        'ok': True,
        'has_ai_agent': clinic.has_ai_agent,
        'has_auto_reminders': clinic.has_auto_reminders,
        'ai_agent_settings': clinic.ai_agent_settings or {}
    })
