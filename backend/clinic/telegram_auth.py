"""
Haqiqiy Telegram akkaunt ulash (MTProto, Telethon orqali).

Oqim:
  1) POST /api/telegram/send-code/  {phone}            -> Telegram REAL kodni foydalanuvchi ilovasiga yuboradi
  2) POST /api/telegram/sign-in/    {phone, code}       -> kod tasdiqlanadi (2FA bo'lsa needs_password=true qaytadi)
  3) POST /api/telegram/password/   {phone, password}   -> 2FA (bulutli parol) bo'lsa
  4) GET  /api/telegram/status/     ?phone=             -> ulanish holati

Ulangan sessiya Telegram'ning "Qurilmalar" ro'yxatida `device_model` nomi bilan
ko'rinadi — bu yerda "dentos.cc" deb o'rnatilgan.
"""
import os
import json
import glob
import time
import datetime
import asyncio
import threading
import mimetypes

from django.conf import settings
from asgiref.sync import sync_to_async
from django.http import FileResponse, Http404
from rest_framework.decorators import api_view, permission_classes
from .access import TenantPermission
from rest_framework.response import Response

from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    PhoneNumberInvalidError,
    PhoneNumberBannedError,
    FloodWaitError,
)

# --- Kredensiallar (faqat env/settings orqali — kod ichida saqlanmaydi) ---
API_ID = int(getattr(settings, 'TELEGRAM_API_ID', '') or os.environ.get('TELEGRAM_API_ID', '0') or 0)
API_HASH = getattr(settings, 'TELEGRAM_API_HASH', '') or os.environ.get('TELEGRAM_API_HASH', '')

# Telegram "Qurilmalar" ro'yxatida shu nom ko'rinadi
DEVICE_MODEL = 'dentos.cc'
SYSTEM_VERSION = 'web'
APP_VERSION = '1.0'

# Yuklab olingan media (rasm/video/dumaloq video/ovoz) shu papkaga tushadi
MEDIA_DIR = os.path.join(settings.BASE_DIR, 'telegram_media')
os.makedirs(MEDIA_DIR, exist_ok=True)
MAX_MEDIA_BYTES = 30 * 1024 * 1024  # 30MB dan katta media yuklanmaydi (placeholder ko'rsatiladi)


# ============================================================================
# DOIMIY (persistent) Telethon klient-menejeri.
# Bitta background event-loop'da har akkaunt uchun BITTA klient ochiq turadi —
# har so'rovda qayta ulanmaymiz (tez + sessiya ziddiyatsiz + real-time uchun).
# ============================================================================
class _TgManager:
    def __init__(self):
        self.loop = None
        self.clients = {}  # session_str -> TelegramClient
        self._lock = threading.Lock()

    def _run(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, coro, timeout=60):
        """Coroutine'ni background loop'da bajaradi (thread-safe)."""
        with self._lock:
            if self.loop is None:
                self.loop = asyncio.new_event_loop()
                threading.Thread(target=self._run, daemon=True).start()
        fut = asyncio.run_coroutine_threadsafe(coro, self.loop)
        try:
            return fut.result(timeout=timeout)
        except TimeoutError:
            fut.cancel()
            raise

    async def _get_client(self, session_str):
        c = self.clients.get(session_str)
        if c is not None and c.is_connected():
            return c
        if c is None:
            c = TelegramClient(
                StringSession(session_str), API_ID, API_HASH,
                device_model=DEVICE_MODEL, system_version=SYSTEM_VERSION, app_version=APP_VERSION,
            )
            self.clients[session_str] = c

            @c.on(events.NewMessage(incoming=True))
            async def _auto_handle_patient_reply(event):
                try:
                    if not event.is_private or event.out:
                        return
                    sender = await event.get_sender()
                    if getattr(sender, 'bot', False):
                        return
                    account, account_data = _account_for_session(session_str)
                    clinic_id = await sync_to_async(_clinic_id_for_session, thread_sensitive=True)(session_str)
                    if not account or not clinic_id or account_data.get('user', {}).get('is_bot'):
                        return
                    sender_id = getattr(sender, 'id', None)
                    if not sender_id:
                        return
                    phone = getattr(sender, 'phone', '') or ''
                    media = getattr(event.message, 'media', None)
                    # An attached contact only authenticates its own Telegram user.
                    if getattr(media, 'user_id', None) == sender_id:
                        phone = getattr(media, 'phone_number', '') or phone
                    raw_text = (event.raw_text or '').strip()
                    if not raw_text and phone and getattr(media, 'phone_number', None):
                        raw_text = 'contact'
                    if not raw_text:
                        return
                    sender_name = ' '.join(filter(None, [getattr(sender, 'first_name', ''), getattr(sender, 'last_name', '')]))
                    from .reception_account import prepare_message, mark_delivered
                    record = await sync_to_async(prepare_message, thread_sensitive=True)(
                        clinic_id, account, sender_id, event.id, raw_text, phone, sender_name, getattr(sender, 'access_hash', None)
                    )
                    if record and not record.delivered:
                        reply = record.result.get('reply', '')
                        outgoing = await event.reply(reply) if reply else None
                        await sync_to_async(mark_delivered, thread_sensitive=True)(record.pk, outgoing.id if outgoing else None)
                except Exception as e:
                    print('Auto handle reply error:', e)

        if not c.is_connected():
            await c.connect()
        return c

    def client(self, session_str):
        """Ulangan (doimiy) klientni qaytaradi."""
        return self.run(self._get_client(session_str))


def _account_for_session(session_str):
    for account, data in _load_sessions().items():
        if data.get('session') == session_str:
            return account, data
    return None, {}


def _clinic_id_for_session(session_str):
    """Fail closed for unbound sessions; never fall back to another clinic."""
    account, data = _account_for_session(session_str)
    if not account or account.startswith('bot_') or data.get('user', {}).get('is_bot'):
        return None
    if data.get('clinic_id'):
        try: return int(data['clinic_id'])
        except (TypeError, ValueError): return None
    # Legacy sessions can be resolved from an explicit existing branch association.
    from .models import Branch
    ids = list(Branch.objects.filter(telegram_phone=account, clinic__isnull=False).values_list('clinic_id', flat=True).distinct())
    return ids[0] if len(ids) == 1 else None


def _route_inbound_message(clinic_id, phone, text, sender_name=None, contact_key=None):
    from .models import ClinicTenant
    from .reception import respond
    if not ClinicTenant.objects.filter(pk=clinic_id, status='active', has_ai_agent=True).exists() or not contact_key:
        return ''
    return respond(clinic_id, contact_key, text, verified_phone=phone, display_name=sender_name or '').get('reply', '')


_manager = _TgManager()

# Login jarayonidagi vaqtinchalik sessiyalar (send-code -> sign-in orasida)
_PENDING_FILE = os.path.join(settings.RUNTIME_DIR, 'telegram_pending.json')


def _load_pending():
    try:
        if os.path.exists(_PENDING_FILE):
            with open(_PENDING_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # 30 daqiqadan eski qolib ketgan vaqtinchalik yozuvlarni tozalaymiz
                now = time.time()
                clean = {k: v for k, v in data.items() if now - v.get('timestamp', 0) < 1800}
                return clean
    except Exception:
        pass
    return {}


def _atomic_json(path, data):
    import tempfile
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=os.path.dirname(path), suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(data, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def _save_pending(data):
    _atomic_json(_PENDING_FILE, data)


# Yakuniy (ulangan) sessiyalar shu faylga saqlanadi
_SESS_FILE = os.path.join(settings.RUNTIME_DIR, 'telegram_sessions.json')


def _load_sessions():
    try:
        with open(_SESS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _save_sessions(data):
    _atomic_json(_SESS_FILE, data)


def _norm(phone: str) -> str:
    """
    Telefon raqamini xalqaro formatga to'g'rilaydi.
    - Bo'sh bo'lsa -> ''
    - 9 xonali bo'lsa (masalan 901234567) -> '+998901234567'
    - 12 xonali (998901234567) -> '+998901234567'
    - Boshqa xalqaro raqamlar -> '+' va raqamlar
    """
    if not phone:
        return ''
    digits = ''.join(ch for ch in str(phone) if ch.isdigit())
    if not digits:
        return ''
    if len(digits) == 9:
        return '+998' + digits
    if len(digits) == 12 and digits.startswith('998'):
        return '+' + digits
    return '+' + digits


def _new_client(session_str=''):
    return TelegramClient(
        StringSession(session_str), API_ID, API_HASH,
        device_model=DEVICE_MODEL, system_version=SYSTEM_VERSION, app_version=APP_VERSION,
    )


# ------------------------- 1. KOD YUBORISH -------------------------
async def _send_code(phone):
    client = _new_client()
    await client.connect()
    try:
        sent = await client.send_code_request(phone)
        sent_type = 'app'
        type_name = type(getattr(sent, 'type', None)).__name__
        if 'Sms' in type_name:
            sent_type = 'sms'
        elif 'Call' in type_name:
            sent_type = 'call'
        elif 'App' in type_name:
            sent_type = 'app'
        timeout = getattr(sent, 'timeout', 60) or 60
        return client.session.save(), sent.phone_code_hash, sent_type, timeout
    finally:
        await client.disconnect()


def _do_send_code(phone):
    if len(phone) < 10:
        return {'ok': False, 'error': 'invalid_phone', 'message': 'Telefon raqami noto‘g‘ri kiritildi'}, 400
    try:
        session_str, phone_code_hash, sent_type, timeout = asyncio.run(_send_code(phone))
        pending = _load_pending()
        pending[phone] = {
            'session': session_str,
            'phone_code_hash': phone_code_hash,
            'sent_type': sent_type,
            'timestamp': int(time.time()),
        }
        _save_pending(pending)
        msg = (
            'Tasdiqlash kodi rasmiy Telegram ilovangizga ("Telegram" chatiga) yuborildi'
            if sent_type == 'app'
            else 'Tasdiqlash kodi telefoningizga SMS orqali yuborildi'
        )
        return {
            'ok': True,
            'phone': phone,
            'sent_type': sent_type,
            'timeout': timeout,
            'message': msg,
        }, 200
    except PhoneNumberInvalidError:
        return {'ok': False, 'error': 'invalid_phone', 'message': 'Ushbu telefon raqami Telegramda ro‘yxatdan o‘tmagan yoki noto‘g‘ri'}, 400
    except PhoneNumberBannedError:
        return {'ok': False, 'error': 'banned', 'message': 'Ushbu raqam Telegram tomonidan bloklangan'}, 400
    except FloodWaitError as e:
        minutes = max(1, round(e.seconds / 60))
        return {'ok': False, 'error': 'flood', 'message': f'Juda ko‘p urinish qilindi. Iltimos, {minutes} daqiqa kuting'}, 429
    except Exception as e:
        return {'ok': False, 'error': 'send_failed', 'message': f'Kod yuborishda xatolik: {str(e)}'}, 500


@api_view(['POST'])
@permission_classes([TenantPermission])
def send_code(request):
    raw_phone = request.data.get('phone', '')
    phone = _norm(raw_phone)
    existing = _load_sessions().get(phone)
    if existing and existing.get('clinic_id') != _get_request_clinic_id(request):
        return Response({'ok': False, 'error': 'account_scope'}, status=403)
    data, status_code = _do_send_code(phone)
    if data.get('ok'):
        pending = _load_pending()
        if phone in pending:
            pending[phone]['clinic_id'] = _get_request_clinic_id(request)
            _save_pending(pending)
    return Response(data, status=status_code)


# ------------------------- 1.1 KODNI QAYTA YUBORISH (SMS / Resend) -------------------------
async def _resend_code(phone, session_str, phone_code_hash):
    from telethon.tl.functions.auth import ResendCodeRequest
    client = _new_client(session_str)
    await client.connect()
    try:
        sent = await client(ResendCodeRequest(phone_number=phone, phone_code_hash=phone_code_hash))
        sent_type = 'sms' if 'Sms' in type(getattr(sent, 'type', None)).__name__ else 'app'
        return client.session.save(), sent.phone_code_hash, sent_type
    finally:
        await client.disconnect()


@api_view(['POST'])
@permission_classes([TenantPermission])
def resend_code(request):
    raw_phone = request.data.get('phone', '')
    phone = _norm(raw_phone)
    pending = _load_pending()
    item = pending.get(phone)
    if item and item.get('clinic_id') != _get_request_clinic_id(request):
        return Response({'ok': False, 'error': 'account_scope'}, status=403)
    if not item:
        return Response({'ok': False, 'error': 'restart_login'}, status=400)
    try:
        new_session, new_hash, sent_type = asyncio.run(_resend_code(phone, item['session'], item['phone_code_hash']))
        pending[phone]['session'] = new_session
        pending[phone]['phone_code_hash'] = new_hash
        pending[phone]['sent_type'] = sent_type
        _save_pending(pending)
        return Response({
            'ok': True,
            'phone': phone,
            'sent_type': sent_type,
            'message': 'Kod qaytadan yuborildi (SMS yoki Telegram ilovangizni tekshiring)',
        })
    except Exception:
        return Response({'ok': False, 'error': 'restart_login'}, status=400)


# ------------------------- 2. KODNI TASDIQLASH -------------------------
async def _sign_in(phone, code, session_str, phone_code_hash):
    client = _new_client(session_str)
    await client.connect()
    try:
        try:
            await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            # 2FA (bulutli parol) yoqilgan — sessiyani saqlab, parol so'raymiz
            return {'needs_password': True, 'session': client.session.save()}
        me = await client.get_me()
        return {
            'ok': True,
            'session': client.session.save(),
            'user': {
                'id': me.id,
                'first_name': me.first_name,
                'username': me.username,
                'phone': me.phone,
            },
        }
    finally:
        await client.disconnect()


@api_view(['POST'])
@permission_classes([TenantPermission])
def sign_in(request):
    raw_phone = request.data.get('phone', '')
    phone = _norm(raw_phone)
    code = str(request.data.get('code', '')).strip()
    pending = _load_pending()
    item = pending.get(phone)
    if item and item.get('clinic_id') != _get_request_clinic_id(request):
        return Response({'ok': False, 'error': 'account_scope'}, status=403)
    if not item:
        return Response({'ok': False, 'error': 'no_pending', 'message': 'Avval tasdiqlash kodini so‘rang'}, status=400)
    try:
        result = asyncio.run(_sign_in(phone, code, item['session'], item['phone_code_hash']))
        if result.get('needs_password'):
            pending[phone]['session'] = result['session']  # 2FA uchun sessiyani yangilaymiz
            _save_pending(pending)
            return Response({'ok': False, 'needs_password': True, 'message': 'Ikki bosqichli bulutli parol kerak'})
        # Muvaffaqiyatli — sessiyani saqlaymiz
        sessions = _load_sessions()
        sessions[phone] = {
            'session': result['session'],
            'clinic_id': _get_request_clinic_id(request),
            'device': DEVICE_MODEL,
            'user': result['user'],
            'connected': True,
            'connected_at': datetime.datetime.now().strftime('%d.%m.%Y %H:%M'),
        }
        _save_sessions(sessions)
        _manager.run(_manager._get_client(result['session']))
        pending.pop(phone, None)
        _save_pending(pending)
        return Response({'ok': True, 'user': result['user'], 'device': DEVICE_MODEL, 'phone': phone})
    except (PhoneCodeInvalidError,):
        return Response({'ok': False, 'error': 'bad_code', 'message': 'Tasdiqlash kodi noto‘g‘ri kiritildi'}, status=400)
    except (PhoneCodeExpiredError,):
        pending.pop(phone, None)
        _save_pending(pending)
        return Response({'ok': False, 'error': 'expired', 'message': 'Kod muddati tugadi, qaytadan kod oling'}, status=400)
    except Exception as e:
        return Response({'ok': False, 'error': 'signin_failed', 'message': f'Ulanishda xatolik: {str(e)}'}, status=500)


# ------------------------- 3. 2FA PAROL -------------------------
async def _sign_in_password(session_str, password):
    client = _new_client(session_str)
    await client.connect()
    try:
        await client.sign_in(password=password)
        me = await client.get_me()
        return {
            'ok': True,
            'session': client.session.save(),
            'user': {'id': me.id, 'first_name': me.first_name, 'username': me.username, 'phone': me.phone},
        }
    finally:
        await client.disconnect()


@api_view(['POST'])
@permission_classes([TenantPermission])
def sign_in_password(request):
    raw_phone = request.data.get('phone', '')
    phone = _norm(raw_phone)
    password = str(request.data.get('password', ''))
    pending = _load_pending()
    item = pending.get(phone)
    if item and item.get('clinic_id') != _get_request_clinic_id(request):
        return Response({'ok': False, 'error': 'account_scope'}, status=403)
    if not item:
        return Response({'ok': False, 'error': 'no_pending', 'message': 'Avval tasdiqlash kodini so‘rang'}, status=400)
    try:
        result = asyncio.run(_sign_in_password(item['session'], password))
        sessions = _load_sessions()
        sessions[phone] = {
            'session': result['session'],
            'clinic_id': _get_request_clinic_id(request),
            'device': DEVICE_MODEL,
            'user': result['user'],
            'connected': True,
            'connected_at': datetime.datetime.now().strftime('%d.%m.%Y %H:%M'),
        }
        _save_sessions(sessions)
        _manager.run(_manager._get_client(result['session']))
        pending.pop(phone, None)
        _save_pending(pending)
        return Response({'ok': True, 'user': result['user'], 'device': DEVICE_MODEL, 'phone': phone})
    except Exception as e:
        return Response({'ok': False, 'error': 'password_failed', 'message': f'Bulutli parol noto‘g‘ri kiritildi: {str(e)}'}, status=400)


# ------------------------- 3.1 QR KOD BILAN ULASH -------------------------
_QR_FLOWS = {}  # token_id -> {'qr': qr_login, 'client': client, 'created_at': float}


async def _qr_start(clinic_id=None):
    client = _new_client()
    await client.connect()
    qr = await client.qr_login()
    token_id = os.urandom(8).hex()
    _QR_FLOWS[token_id] = {'qr': qr, 'client': client, 'created_at': time.time(), 'clinic_id': clinic_id}
    exp_iso = qr.expires.isoformat() if getattr(qr, 'expires', None) else ''
    return token_id, qr.url, exp_iso


@api_view(['POST'])
@permission_classes([TenantPermission])
def qr_start(request):
    """Telegram ilovasida skaner qilish uchun QR login yaratadi."""
    try:
        token_id, url, expires = _manager.run(_qr_start(_get_request_clinic_id(request)))
        return Response({'ok': True, 'token_id': token_id, 'url': url, 'expires': expires})
    except Exception as e:
        return Response({'ok': False, 'error': 'qr_failed', 'message': str(e)}, status=500)


async def _qr_check(token_id):
    flow = _QR_FLOWS.get(token_id)
    if not flow:
        return {'ok': False, 'error': 'not_found'}
    qr = flow['qr']
    client = flow['client']
    try:
        user = await qr.wait(timeout=1.5)
        session_str = client.session.save()
        phone = '+' + str(getattr(user, 'phone', '')) if getattr(user, 'phone', None) else f"+tg_{user.id}"
        u_info = {
            'id': user.id,
            'first_name': getattr(user, 'first_name', '') or '',
            'username': getattr(user, 'username', '') or '',
            'phone': getattr(user, 'phone', '') or '',
        }
        sessions = _load_sessions()
        sessions[phone] = {
            'session': session_str,
            'clinic_id': flow.get('clinic_id'),
            'device': DEVICE_MODEL,
            'user': u_info,
            'connected': True,
            'connected_at': datetime.datetime.now().strftime('%d.%m.%Y %H:%M'),
        }
        _save_sessions(sessions)
        await client.disconnect()
        await _manager._get_client(session_str)
        _QR_FLOWS.pop(token_id, None)
        return {'ok': True, 'authorized': True, 'user': u_info, 'phone': phone}
    except asyncio.TimeoutError:
        return {'ok': True, 'authorized': False}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@api_view(['GET'])
@permission_classes([TenantPermission])
def qr_status(request):
    """QR kod skaner qilinganligini tekshiradi."""
    token_id = request.GET.get('token_id', '')
    if not token_id or token_id not in _QR_FLOWS:
        return Response({'ok': False, 'error': 'invalid_token'}, status=400)
    if _QR_FLOWS[token_id].get('clinic_id') != _get_request_clinic_id(request):
        return Response({'ok': False, 'error': 'account_scope'}, status=403)
    try:
        res = _manager.run(_qr_check(token_id))
        return Response(res)
    except Exception as e:
        return Response({'ok': False, 'error': str(e)}, status=500)


# ------------------------- 3.2 TELEGRAM BOT TOKEN BILAN ULASH -------------------------
async def _bot_login(token):
    client = _new_client()
    await client.connect()
    try:
        await client.sign_in(bot_token=token)
        me = await client.get_me()
        session_str = client.session.save()
        u_info = {
            'id': me.id,
            'first_name': getattr(me, 'first_name', '') or '',
            'username': getattr(me, 'username', '') or '',
            'phone': '',
            'is_bot': True,
        }
        phone = f"bot_{me.id}"
        return session_str, u_info, phone
    finally:
        await client.disconnect()


@api_view(['POST'])
@permission_classes([TenantPermission])
def bot_login(request):
    """@BotFather bergan Bot Token orqali Telegram botni ulaydi."""
    return Response({'ok': False, 'error': 'login_only', 'message': 'Bot faqat login uchun. Klinika Telegram akkauntini telefon yoki QR orqali ulang.'}, status=400)


def _get_request_clinic_id(request):
    raw_cid = request.headers.get('X-Clinic-ID') or request.headers.get('X-Clinic-Id') or request.GET.get('clinic')
    if raw_cid:
        try:
            return int(raw_cid)
        except Exception:
            return None
    return None


# ------------------------- 4. HOLAT / UZISH -------------------------
@api_view(['GET'])
@permission_classes([TenantPermission])
def status(request):
    raw_phone = request.GET.get('phone', '').strip()
    phone = _norm(raw_phone) if raw_phone else ''
    sessions = _load_sessions()

    target_cid = _get_request_clinic_id(request)
    clinic_sessions = {
        p: value for p, value in sessions.items()
        if not value.get('user', {}).get('is_bot') and not p.startswith('bot_')
        and (target_cid is not None and _clinic_id_for_session(value.get('session')) == target_cid)
    }

    if phone:
        s = clinic_sessions.get(phone)
        return Response({
            'connected': bool(s),
            'phone': phone,
            'device': (s or {}).get('device', DEVICE_MODEL),
            'user': (s or {}).get('user'),
            'connectedAt': (s or {}).get('connected_at', ''),
        })

    # phone ko'rsatilmagan bo'lsa: ushbu klinika uchun ulangan Telegram bormi tekshiramiz
    has_connected = len(clinic_sessions) > 0
    first_phone = next(iter(clinic_sessions.keys())) if has_connected else ''
    first_sess = clinic_sessions.get(first_phone) if first_phone else None
    return Response({
        'connected': has_connected,
        'phone': first_phone,
        'user': (first_sess or {}).get('user'),
        'device': (first_sess or {}).get('device', DEVICE_MODEL),
        'connectedAt': (first_sess or {}).get('connected_at', ''),
        'accounts': [
            {'phone': p, 'user': v.get('user'), 'device': v.get('device', DEVICE_MODEL), 'connectedAt': v.get('connected_at', '')}
            for p, v in clinic_sessions.items()
        ],
    })


# ------------------------- 5. BEMOR BILAN CHAT (qidirish + tarix + yuborish) -------------------------
def _active_session(account_phone=None):
    """Ulangan sessiyani tanlaydi: account_phone berilса o'sha, aks holda birinchisi."""
    sessions = _load_sessions()
    if not sessions:
        return None
    if account_phone:
        s = sessions.get(_norm(account_phone))
        if s:
            return s['session']
    # birinchi ulangan akkaunt
    first = next(iter(sessions.values()))
    return first['session']


async def _resolve_entity(client, phone, name='Bemor'):
    """Telefon raqami bo'yicha Telegram foydalanuvchisini topadi (kontaktga import qilib)."""
    from telethon.tl.functions.contacts import ImportContactsRequest
    from telethon.tl.types import InputPhoneContact
    # avval to'g'ridan-to'g'ri (kontaktda bo'lsa)
    try:
        return await client.get_entity(phone)
    except Exception:
        pass
    try:
        res = await client(ImportContactsRequest(
            [InputPhoneContact(client_id=0, phone=phone, first_name=(name or 'Bemor'), last_name='')]
        ))
        if res.users:
            return res.users[0]
    except Exception as e:
        print('resolve import error:', e)
    return None


def _media_type(m):
    """Xabar media turini aniqlaydi."""
    try:
        if getattr(m, 'photo', None):
            return 'photo'
        if getattr(m, 'video_note', None):
            return 'video_note'   # dumaloq video
        if getattr(m, 'gif', None):
            return 'gif'
        if getattr(m, 'video', None):
            return 'video'
        if getattr(m, 'voice', None):
            return 'voice'        # ovozli xabar
        if getattr(m, 'audio', None):
            return 'audio'
        if getattr(m, 'sticker', None):
            return 'sticker'
        if getattr(m, 'document', None):
            return 'document'
    except Exception:
        pass
    return None


async def _download_media(client, m, chat_id):
    """Media faylni yuklab, /api/telegram/media/<fayl> URL qaytaradi (kesh bilan)."""
    mt = _media_type(m)
    if not mt:
        return None, None
    clinic_id = _clinic_id_for_session(client.session.save())
    if not clinic_id:
        return mt, None
    base = os.path.join(MEDIA_DIR, f'c{clinic_id}_{chat_id}_{m.id}')
    existing = glob.glob(base + '.*')
    if existing:
        return mt, '/api/telegram/media/' + os.path.basename(existing[0])
    # Hajm chegarasi (katta video/hujjatlarni yuklamaymiz)
    size = 0
    try:
        size = getattr(getattr(m, 'file', None), 'size', 0) or 0
    except Exception:
        size = 0
    if size and size > MAX_MEDIA_BYTES:
        return mt, None
    try:
        fpath = await client.download_media(m, file=base)
    except Exception as e:
        print('media download error:', e)
        return mt, None
    if not fpath or not os.path.exists(fpath):
        return mt, None
    return mt, '/api/telegram/media/' + os.path.basename(fpath)


async def _msg_dict(client, m, chat_id):
    text = m.message or ''
    media_type, media_url = await _download_media(client, m, chat_id)
    return {
        'id': m.id,
        'text': text,                 # media bo'lsa bu — izoh (caption)
        'out': bool(m.out),           # True = biz (klinika) yubordik
        'date': m.date.isoformat() if m.date else '',
        'media_type': media_type,     # photo|video|video_note|voice|audio|gif|sticker|document|None
        'media_url': media_url,       # media faylga havola (None bo'lsa yuklanmadi)
    }


async def _chat_history(session_str, target_phone, limit, name='Bemor', offset_id=0):
    client = await _manager._get_client(session_str)   # doimiy klient (qayta ulanmaymiz)
    if not await client.is_user_authorized():
        return {'ok': False, 'error': 'not_authorized'}
    entity = await _resolve_entity(client, target_phone, name)
    if not entity:
        return {'ok': True, 'found': False}
    user = {
        'id': entity.id,
        'first_name': getattr(entity, 'first_name', '') or '',
        'last_name': getattr(entity, 'last_name', '') or '',
        'username': getattr(entity, 'username', '') or '',
        'phone': getattr(entity, 'phone', '') or '',
    }
    # offset_id=0 → oxirgi `limit` ta; offset_id=X → X'dan ESKI `limit` ta (scroll-yuqoriga uchun)
    msgs = await client.get_messages(entity, limit=limit, offset_id=offset_id or 0)
    chat_id = getattr(entity, 'id', 'x')
    messages = [await _msg_dict(client, m, chat_id) for m in reversed(msgs)]  # eski→yangi tartib
    # yana eski xabar bormi? (offset_id bilan so'ralganda to'liq limit qaytsa — bor deb hisoblaymiz)
    has_more = len(msgs) >= limit
    return {'ok': True, 'found': True, 'has_history': len(messages) > 0, 'has_more': has_more, 'user': user, 'messages': messages}


@api_view(['POST'])
@permission_classes([TenantPermission])
def chat(request):
    target = _norm(request.data.get('phone'))
    account = request.data.get('account_phone')
    name = request.data.get('name') or 'Bemor'
    try:
        limit = max(1, min(50, int(request.data.get('limit', 10))))
    except Exception:
        limit = 10
    try:
        offset_id = int(request.data.get('offset_id', 0))
    except Exception:
        offset_id = 0
    from .reception_account import account_for_clinic
    _account, data = account_for_clinic(_get_request_clinic_id(request), account or '')
    session_str = data.get('session') if data else None
    if not session_str:
        return Response({'ok': False, 'error': 'not_connected', 'message': 'Telegram akkaunt ulanmagan'}, status=400)
    if len(target) < 10:
        return Response({'ok': False, 'error': 'invalid_phone', 'message': 'Bemor raqami noto‘g‘ri'}, status=400)
    try:
        result = _manager.run(_chat_history(session_str, target, limit, name, offset_id))
        if not result.get('ok') and result.get('error') == 'not_authorized':
            return Response({'ok': False, 'error': 'not_connected', 'message': 'Sessiya eskirgan, qaytadan ulang'}, status=400)
        # media_url ni to'liq (absolyut) manzilga aylantiramiz
        for msg in result.get('messages', []) or []:
            if msg.get('media_url'):
                msg['media_url'] = request.build_absolute_uri(msg['media_url'])
        return Response(result)
    except Exception as e:
        return Response({'ok': False, 'error': 'chat_failed', 'message': str(e)}, status=500)


async def _send_to(session_str, target_phone, text, name='Bemor'):
    client = await _manager._get_client(session_str)   # doimiy klient
    if not await client.is_user_authorized():
        return {'ok': False, 'error': 'not_authorized'}
    entity = await _resolve_entity(client, target_phone, name)
    if not entity:
        return {'ok': True, 'found': False}
    m = await client.send_message(entity, text)
    return {'ok': True, 'found': True, 'message': await _msg_dict(client, m, getattr(entity, 'id', 'x'))}


@api_view(['POST'])
@permission_classes([TenantPermission])
def send_to(request):
    target = _norm(request.data.get('phone'))
    text = str(request.data.get('text', '')).strip()
    account = request.data.get('account_phone')
    name = request.data.get('name') or 'Bemor'
    if not text:
        return Response({'ok': False, 'error': 'empty', 'message': 'Xabar bo‘sh'}, status=400)
    from .reception_account import account_for_clinic
    _account, data = account_for_clinic(_get_request_clinic_id(request), account or '')
    session_str = data.get('session') if data else None
    if not session_str:
        return Response({'ok': False, 'error': 'not_connected', 'message': 'Telegram akkaunt ulanmagan'}, status=400)
    try:
        result = _manager.run(_send_to(session_str, target, text, name))
        if not result.get('ok') and result.get('error') == 'not_authorized':
            return Response({'ok': False, 'error': 'not_connected', 'message': 'Sessiya eskirgan, qaytadan ulang'}, status=400)
        if result.get('message') and result['message'].get('media_url'):
            result['message']['media_url'] = request.build_absolute_uri(result['message']['media_url'])
        return Response(result)
    except Exception as e:
        return Response({'ok': False, 'error': 'send_failed', 'message': str(e)}, status=500)


async def _logout(session_str):
    # doimiy klient bo'lsa o'shani log out qilamiz, so'ng keshdan olib tashlaymiz
    client = await _manager._get_client(session_str)
    try:
        await client.log_out()
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass
        _manager.clients.pop(session_str, None)


@api_view(['POST'])
@permission_classes([TenantPermission])
def disconnect(request):
    raw_phone = request.data.get('phone', '')
    phone = _norm(raw_phone) if raw_phone else ''
    sessions = _load_sessions()
    from .reception_account import account_for_clinic
    target_phone, _ = account_for_clinic(_get_request_clinic_id(request), phone)
    if not target_phone:
        return Response({'ok': False, 'error': 'account_scope'}, status=403)
    if target_phone and target_phone in sessions:
        s = sessions.pop(target_phone)
        try:
            _manager.run(_logout(s['session']))
        except Exception as e:
            print('telegram logout error:', e)
        _save_sessions(sessions)
    return Response({'ok': True})


# ------------------------- 6. MEDIA FAYLNI KO'RSATISH -------------------------
def media(request, filename):
    """Yuklab olingan Telegram media faylini qaytaradi (rasm/video/dumaloq video/ovoz)."""
    # xavfsizlik: faqat fayl nomi (papkadan chiqib ketmasin)
    safe = os.path.basename(filename)
    principal = getattr(request, 'crm_principal', None)
    if not principal or (not principal.is_superuser and not safe.startswith(f'c{principal.clinic_id}_')):
        raise Http404('media not found')
    path = os.path.join(MEDIA_DIR, safe)
    if not os.path.exists(path):
        raise Http404('media not found')
    ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    return FileResponse(open(path, 'rb'), content_type=ctype)


# ------------------------- 7. BOOT: SAQLANGAN SESSIYALARNI TINGLASHGA ULAYMIZ -------------------------
_listeners_started = False


def start_listeners():
    """Server ishga tushganda barcha ulangan Telegram sessiyalarini TINGLASHGA ulaymiz.

    Aks holda incoming NewMessage handler (_auto_handle_patient_reply) hech qachon
    ishga tushmaydi — chunki u faqat _get_client chaqirilganda ro'yxatdan o'tadi.
    Shu tufayli bemor klinikaning Telegramiga yozsa AI javob bermaydi edi.
    """
    global _listeners_started
    if _listeners_started:
        return
    _listeners_started = True

    def _boot():
        try:
            sessions = _load_sessions()
        except Exception:
            sessions = {}
        for phone, s in (sessions.items() if sessions else []):
            sess = s.get('session')
            if not sess or not _clinic_id_for_session(sess):
                continue
            try:
                # _get_client ulaydi + incoming handler'ni ro'yxatdan o'tkazadi + tinglab turadi
                _manager.run(_manager._get_client(sess), timeout=60)
                print(f'[TG] Listener ulandi: {phone}')
            except Exception as e:
                print(f'[TG] Listener ulanmadi ({phone}):', e)

    # Boshqa ishga tushish ishlarini bloklamaslik uchun alohida thread'da
    threading.Thread(target=_boot, daemon=True).start()
