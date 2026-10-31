"""Dedicated login bot. No access codes are returned through HTTP or stored in plaintext."""
import datetime
import re
import secrets
import uuid
import requests
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework.response import Response
from .models import (TelegramLoginContact, TelegramLoginChallenge, Employee,
                     PlatformUser, ClinicTenant, DentalTechnician)


class LoginRateThrottle(AnonRateThrottle):
    rate = '20/min'


def normalize_phone(value):
    digits = re.sub(r'\D', '', str(value or ''))
    # O'zbekiston lokal formati: 9 xonali raqam (masalan 917903523) → 998 qo'shamiz.
    # 0 bilan boshlangan 10 xonali (0917903523) ham → 998 + oxirgi 9 xona.
    if len(digits) == 9:
        digits = '998' + digits
    elif len(digits) == 10 and digits.startswith('0'):
        digits = '998' + digits[1:]
    return digits if re.fullmatch(r'[1-9][0-9]{6,14}', digits) else ''


def bot_call(method, **payload):
    token = getattr(settings, 'TELEGRAM_LOGIN_BOT_TOKEN', '')
    if not token:
        raise RuntimeError('Telegram kirish boti sozlanmagan.')
    try:
        response = requests.post(f'https://api.telegram.org/bot{token}/{method}', json=payload, timeout=35)
        data = response.json()
    except (requests.RequestException, ValueError):
        raise RuntimeError('Telegram bilan ulanish amalga oshmadi.') from None
    if not data.get('ok'):
        # Telegram exceptions may contain the token URL. Never log them.
        raise RuntimeError('Telegram so‘rovni qabul qilmadi. Botga /start yuborganingizni tekshiring.')
    return data['result']


def bot_link():
    name = getattr(settings, 'TELEGRAM_LOGIN_BOT_USERNAME', '').strip('@')
    return f'https://t.me/{name}?start=login' if re.fullmatch(r'[A-Za-z0-9_]+', name) else ''


def _platform_for_employee(employee):
    """Employee -> login akkaunt (PlatformUser). username yoki F.I.O bo'yicha bir xil klinikada."""
    if employee.username:
        user = (PlatformUser.objects.filter(username__iexact=employee.username, clinic_id=employee.clinic_id, is_active=True).first()
                or PlatformUser.objects.filter(username__iexact=employee.username, is_active=True).first())
        if user:
            return user
    if employee.full_name:
        return PlatformUser.objects.filter(full_name__iexact=employee.full_name, clinic_id=employee.clinic_id, is_active=True).first()
    return None


def find_account(phone):
    """Telefon raqami bo'yicha AYNAN BITTA faol akkaunt topadi, aks holda None.

    Ustuvorlik: (1) login akkaunt o'z telefoni, (2) xodim telefoni -> login akkaunt,
    (3) klinika telefoni -> direktor, (4) zubnoy texnik. Bir xil akkaunt bir necha
    manbadan kelsa, u (type, pk) bo'yicha BIR MARTA sanaladi.
    """
    phone = normalize_phone(phone)
    if not phone:
        return None
    candidates = {}

    # 1) Eng ishonchli: login akkauntning o'z telefoni
    for user in PlatformUser.objects.filter(is_active=True).exclude(phone=''):
        if normalize_phone(user.phone) == phone:
            candidates[('platform', user.pk)] = user

    # 2) Xodim telefoni -> login akkaunt
    for employee in Employee.objects.filter(is_active=True, can_login=True).exclude(phone=''):
        if normalize_phone(employee.phone) == phone:
            user = _platform_for_employee(employee)
            if user:
                candidates[('platform', user.pk)] = user

    # 3) Klinika telefoni -> direktor
    for clinic in ClinicTenant.objects.exclude(phone=''):
        if normalize_phone(clinic.phone) == phone:
            for user in PlatformUser.objects.filter(clinic=clinic, role='director', is_active=True):
                candidates[('platform', user.pk)] = user

    # 4) Zubnoy texnik — mos login akkaunt bo'lsa o'sha, bo'lmasa texnik yozuvi
    for tech in DentalTechnician.objects.filter(is_active=True).exclude(phone=''):
        if normalize_phone(tech.phone) == phone:
            user = PlatformUser.objects.filter(username=tech.username, role='technician', is_active=True).first()
            if user:
                candidates[('platform', user.pk)] = user
            else:
                candidates[('technician', tech.pk)] = tech

    return next(iter(candidates.values())) if len(candidates) == 1 else None


def account_payload(account):
    if isinstance(account, PlatformUser):
        from .serializers import PlatformUserSerializer
        from .views import _clinic_modules_payload
        data = PlatformUserSerializer(account).data
        data['enabled_modules'] = _clinic_modules_payload(account.clinic)
        return data
    return {'id': account.pk, 'username': account.username, 'full_name': account.name,
            'role': 'technician', 'role_label': 'Zubnoy Texnik', 'clinic': None,
            'clinic_name': account.lab_name, 'initials': account.name[:2].upper(), 'is_active': True}


def issue_code(phone, purpose='login'):
    now = timezone.now()
    contact = TelegramLoginContact.objects.filter(phone=phone).first()
    if not contact:
        return {'ok': False, 'needs_start': True, 'bot_url': bot_link(),
                'message': 'Avval botga /start yuboring va «Telefon raqamimni yuborish» tugmasini bosing.'}, 409
    if not find_account(phone):
        return {'ok': False, 'message': 'Raqam faol akkauntga biriktirilmagan yoki bir nechta akkauntga tegishli. Administratorga murojaat qiling.'}, 400
    recent = TelegramLoginChallenge.objects.filter(phone=phone, created_at__gte=now-datetime.timedelta(seconds=60)).exists()
    hourly = TelegramLoginChallenge.objects.filter(phone=phone, created_at__gte=now-datetime.timedelta(hours=1)).count()
    if recent or hourly >= 10:
        return {'ok': False, 'message': 'Kod yaqinda so‘ralgan. Keyinroq qayta urinib ko‘ring.'}, 429
    code = f'{secrets.randbelow(1000000):06d}'
    challenge = TelegramLoginChallenge.objects.create(phone=phone, purpose=purpose, code_hash=make_password(code), expires_at=now+datetime.timedelta(minutes=5))
    action = 'parolni tiklash' if purpose == 'reset' else 'kirish'
    try:
        bot_call('sendMessage', chat_id=contact.chat_id, text=f'DentOS {action} kodi: {code}\n5 daqiqa amal qiladi. Kodni hech kimga bermang. Agar siz so‘ramagan bo‘lsangiz, e’tiborsiz qoldiring.')
    except RuntimeError as exc:
        challenge.consumed = True
        challenge.save(update_fields=['consumed'])
        return {'ok': False, 'message': str(exc)}, 502
    TelegramLoginChallenge.objects.filter(phone=phone, consumed=False).exclude(pk=challenge.pk).update(consumed=True)
    challenge.sent = True
    challenge.save(update_fields=['sent'])
    return {'ok': True, 'sent': True, 'challenge_id': str(challenge.pk), 'message': 'Kod Telegram botga yuborildi.'}, 200


@api_view(['GET'])
@permission_classes([AllowAny])
def bot_info(request):
    return Response({'bot_url': bot_link(), 'configured': bool(getattr(settings, 'TELEGRAM_LOGIN_BOT_TOKEN', '') and bot_link())})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def request_code(request):
    phone = normalize_phone(request.data.get('phone'))
    purpose = request.data.get('purpose', 'login')
    if not phone or purpose not in ('login', 'reset'):
        return Response({'ok': False, 'message': 'Telefon raqami yoki so‘rov turi noto‘g‘ri.'}, status=400)
    data, code = issue_code(phone, purpose)
    return Response(data, status=code)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def verify_code(request):
    try:
        challenge_id = uuid.UUID(str(request.data.get('challenge_id', '')))
    except (ValueError, TypeError):
        return Response({'ok': False, 'message': 'Avval yangi kod so‘rang.'}, status=400)
    phone = normalize_phone(request.data.get('phone'))
    code = str(request.data.get('code', '')).strip()
    with transaction.atomic():
        challenge = TelegramLoginChallenge.objects.select_for_update().filter(pk=challenge_id, phone=phone).first()
        if not challenge or challenge.consumed or not challenge.sent or challenge.expires_at <= timezone.now() or challenge.attempts >= 5:
            return Response({'ok': False, 'message': 'Kod eskirgan yoki ishlatilgan. Yangi kod so‘rang.'}, status=400)
        challenge.attempts += 1
        challenge.save(update_fields=['attempts'])
        if not re.fullmatch(r'\d{6}', code) or not check_password(code, challenge.code_hash):
            return Response({'ok': False, 'message': 'Kod noto‘g‘ri.'}, status=400)
        account = find_account(phone)
        if not account:
            return Response({'ok': False, 'message': 'Faol akkaunt topilmadi.'}, status=400)
        if challenge.purpose == 'reset':
            password = request.data.get('new_password', '')
            try:
                validate_password(password)
            except ValidationError as exc:
                return Response({'ok': False, 'message': ' '.join(exc.messages)}, status=400)
            account.password = make_password(password)
            account.save(update_fields=['password'])
            if isinstance(account, PlatformUser):
                Employee.objects.filter(username=account.username, clinic_id=account.clinic_id).update(password=account.password)
        challenge.consumed = True
        challenge.save(update_fields=['consumed'])
        from .access import login_response
        return login_response(account, {'ok': True, 'user': account_payload(account)})


def handle_update(update):
    message = update.get('message', {})
    sender = message.get('from', {})
    chat = message.get('chat', {})
    if chat.get('type') != 'private' or not sender.get('id') or chat.get('id') != sender['id']:
        return
    contact = message.get('contact')
    if contact:
        phone = normalize_phone(contact.get('phone_number'))
        if contact.get('user_id') != sender['id'] or not phone:
            bot_call('sendMessage', chat_id=chat['id'], text='Faqat o‘zingizning telefon raqamingizni pastdagi tugma orqali yuboring.')
            return
        account = find_account(phone)
        if not account:
            bot_call('sendMessage', chat_id=chat['id'], text='Bu raqam faol akkauntga biriktirilmagan yoki bir nechta akkauntga tegishli. Klinikangiz administratoriga murojaat qiling.')
            return
        existing = TelegramLoginContact.objects.filter(phone=phone).first()
        if existing and existing.telegram_user_id != sender['id']:
            bot_call('sendMessage', chat_id=chat['id'], text='Raqam boshqa Telegram akkauntiga ulangan. Administratorga murojaat qiling.')
            return
        TelegramLoginContact.objects.filter(telegram_user_id=sender['id']).exclude(phone=phone).delete()
        TelegramLoginContact.objects.update_or_create(phone=phone, defaults={'telegram_user_id':sender['id'], 'chat_id':chat['id']})
        # Botда kim ekanini (rol + klinika) ko'rsatib tasdiqlaymiz — "siz shu klinikada shu roldagi odamsiz, to'g'rimi?"
        payload = account_payload(account)
        who = (payload.get('full_name') or '').strip()
        role_label = payload.get('role_label') or payload.get('role') or ''
        clinic_name = payload.get('clinic_name') or ''
        lines = ['✅ Raqamingiz tasdiqlandi. Siz quyidagi akkaunt egasisiz:', '']
        if who: lines.append(f'👤 {who}')
        if role_label: lines.append(f'🏷 Rol: {role_label}')
        if clinic_name: lines.append(f'🏥 Klinika: {clinic_name}')
        lines += ['', 'Agar bu SIZ bo‘lsangiz — saytga qaytib shu raqamni kiriting va «Kod yuborish» tugmasini bosing.',
                  'Agar bu siz bo‘lmasangiz — administratorga murojaat qiling.']
        bot_call('sendMessage', chat_id=chat['id'], text='\n'.join(lines), reply_markup={'remove_keyboard': True})
        return
    bot_call('sendMessage', chat_id=chat['id'], text='DentOS tizimiga xush kelibsiz! Akkauntingizni aniqlash uchun o‘zingizning telefon raqamingizni yuboring.', reply_markup={'keyboard':[[{'text':'Telefon raqamimni yuborish','request_contact':True}]], 'resize_keyboard':True, 'one_time_keyboard':True})
