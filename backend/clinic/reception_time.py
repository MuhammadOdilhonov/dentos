"""Time zones are learned only from explicit patient statements, never phone or language."""
import datetime as dt
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from django.utils import timezone

CLINIC_ZONE = ZoneInfo('Asia/Tashkent')
CITIES = {
 'toshkent':'Asia/Tashkent', 'ташкент':'Asia/Tashkent', 'tashkent':'Asia/Tashkent',
 'moskva':'Europe/Moscow', 'москв':'Europe/Moscow', 'moscow':'Europe/Moscow',
 'london':'Europe/London', 'лондон':'Europe/London',
 'dubai':'Asia/Dubai', 'dubay':'Asia/Dubai', 'дуба':'Asia/Dubai',
 'istanbul':'Europe/Istanbul', 'стамбул':'Europe/Istanbul',
 'new york':'America/New_York', 'nyu york':'America/New_York', 'нью-йорк':'America/New_York',
 'seoul':'Asia/Seoul', 'seul':'Asia/Seoul', 'сеул':'Asia/Seoul',
 'berlin':'Europe/Berlin', 'берлин':'Europe/Berlin',
 'tokyo':'Asia/Tokyo', 'tokio':'Asia/Tokyo', 'токио':'Asia/Tokyo',
}


def clinic_aware(value):
    return value.replace(tzinfo=CLINIC_ZONE) if timezone.is_naive(value) else value.astimezone(CLINIC_ZONE)


def learn_timezone(contact, text):
    t = text.lower().replace('’', "'")
    # No inference from a future travel plan or a bare city/address question.
    current = bool(re.search(r"\bmen\s+(?:hozir\s+)?|\bhozir\s+|\bi(?:'m| am)\s+(?:currently\s+)?in\s+|\bя\s+(?:сейчас\s+)?в\s+", t))
    zone = None
    if current and not re.search(r'boraman|bormoq|ketaman|uchaman|emas|буду|поеду|не в|will|going to|not in',t):
        for city, name in CITIES.items():
            city_pattern = re.escape(city)
            explicit_here = (re.search(r'(?:^|[.!]\s*)?(?:men\s+(?:hozir\s+)?|hozir\s+)' + city_pattern + r'(?:da|daman|damiz)\b',t) or re.search(r"\bi(?:'m| am)\s+(?:currently\s+)?in\s+" + city_pattern + r'\b',t) or re.search(r'\bя\s+(?:сейчас\s+)?в\s+' + city_pattern,t))
            if explicit_here:
                zone = name
                break
    command = re.fullmatch(r'/timezone\s+([A-Za-z_]+/[A-Za-z_/+-]+)',text.strip())
    if command: zone = command[1]
    if not zone: return False
    try: ZoneInfo(zone)
    except (ZoneInfoNotFoundError,ValueError): return False
    contact.timezone_name = zone
    contact.timezone_source = 'patient_statement'
    contact.timezone_updated_at = timezone.now()
    return True


def patient_zone(contact):
    if contact and contact.timezone_name and contact.timezone_updated_at:
        if timezone.now() - contact.timezone_updated_at < dt.timedelta(days=30):
            try: return ZoneInfo(contact.timezone_name)
            except (ZoneInfoNotFoundError,ValueError): pass
    return CLINIC_ZONE


def appointment_time(value, contact=None, lang='uz'):
    value = clinic_aware(value)
    clinic_label = {'uz':'Toshkent vaqti','ru':'время Ташкента','en':'Tashkent time'}.get(lang,'Toshkent vaqti')
    result = f'{value:%d.%m.%Y %H:%M} ({clinic_label}, UTC+05:00)'
    zone = patient_zone(contact)
    if zone.key != CLINIC_ZONE.key:
        city = zone.key.split('/')[-1].replace('_', ' ')
        result += f' / {value.astimezone(zone):%d.%m.%Y %H:%M} ({city})'
    return result


def due_reminder(appointment, contact, now, cfg):
    """Day/week dates follow the recipient's appointment date; hours follow their zone."""
    zone = patient_zone(contact)
    local_now = clinic_aware(now).astimezone(zone)
    visit = clinic_aware(appointment.start_time).astimezone(zone)
    if visit <= local_now or not 9 <= local_now.hour < 20: return None
    hour = max(9,min(19,int(cfg.get('schedule_hour',18))))
    day_due = dt.datetime.combine(visit.date()-dt.timedelta(days=1),dt.time(hour),tzinfo=zone)
    sunday = visit.date()-dt.timedelta(days=visit.weekday()+1)
    week_due = dt.datetime.combine(sunday,dt.time(hour),tzinfo=zone)
    if cfg.get('hour_before') and 30 <= (visit-local_now).total_seconds()/60 <= 75: return 'hour'
    if cfg.get('day_before',True) and day_due <= local_now: return 'day'
    if cfg.get('this_week',True) and week_due <= local_now < day_due: return 'week'
    return None
