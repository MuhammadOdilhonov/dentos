"""
WhatsApp Business Cloud API (Meta) integratsiyasi.

Endpointlar:
  POST /api/whatsapp/config/   {phone_number_id, access_token, verify_token}  -> kredensiallarni saqlaydi
  GET  /api/whatsapp/config/                                                   -> ulanish holati (token yashirin)
  POST /api/whatsapp/send/     {phone, text}                                   -> bemorga xabar yuboradi (Graph API)
  POST /api/whatsapp/chat/     {phone}                                         -> saqlangan yozishmani qaytaradi
  GET  /api/whatsapp/webhook/  (Meta tekshiruvi: hub.challenge)
  POST /api/whatsapp/webhook/  (Meta kiruvchi xabarlarni yuboradi -> saqlaymiz)

Eslatma: Cloud API eski yozishma TARIXINI bermaydi — faqat ulangandan keyin
yuborilgan/kelgan xabarlar saqlanadi. Bemorga BIRINCHI yozish 24 soatlik oynadan
tashqarida faqat tasdiqlangan shablon (template) bilan mumkin.
"""
import os
import json
import time
import urllib.request
import urllib.error

from django.conf import settings
from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

GRAPH_VERSION = 'v21.0'

_CFG_FILE = os.path.join(settings.BASE_DIR, 'whatsapp_config.json')
_MSG_FILE = os.path.join(settings.BASE_DIR, 'whatsapp_messages.json')


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
        print('whatsapp save error:', e)


def _config():
    return _load(_CFG_FILE, {'phone_number_id': '', 'access_token': '', 'verify_token': 'dentical_verify'})


def _digits(phone):
    return ''.join(ch for ch in (phone or '') if ch.isdigit())


def _store_message(patient_phone, msg):
    data = _load(_MSG_FILE, {})
    key = _digits(patient_phone)
    lst = data.get(key, [])
    # dublikatlarни oldini olamiz (id bo'yicha)
    if not any(m.get('id') == msg.get('id') for m in lst):
        lst.append(msg)
    data[key] = lst
    _save(_MSG_FILE, data)


def _send_whatsapp_text(cfg, to, text):
    """WhatsApp Cloud API orqali matnli xabar yuboradi. (True/False)"""
    pnid = cfg.get('phone_number_id')
    token = cfg.get('access_token')
    to = _digits(to)
    if not pnid or not token or len(to) < 10 or not text:
        return False
    url = f'https://graph.facebook.com/{GRAPH_VERSION}/{pnid}/messages'
    payload = json.dumps({
        'messaging_product': 'whatsapp',
        'recipient_type': 'individual',
        'to': to,
        'type': 'text',
        'text': {'preview_url': False, 'body': text},
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode('utf-8'))
        mid = (body.get('messages') or [{}])[0].get('id', str(int(time.time() * 1000)))
        _store_message(to, {'id': mid, 'text': text, 'out': True, 'date': _now_iso()})
        return True
    except Exception as e:
        print('whatsapp auto-reply send error:', e)
        return False


# ------------------------- KONFIG -------------------------
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def config(request):
    if request.method == 'POST':
        cfg = _config()
        cfg['phone_number_id'] = str(request.data.get('phone_number_id', cfg.get('phone_number_id', ''))).strip()
        if request.data.get('access_token'):
            cfg['access_token'] = str(request.data.get('access_token')).strip()
        cfg['verify_token'] = str(request.data.get('verify_token', cfg.get('verify_token', 'dentical_verify'))).strip() or 'dentical_verify'
        # Qaysi klinikaga tegishli ekanini saqlaymiz (AI avto-javob uchun)
        if request.data.get('clinic_id'):
            try:
                cfg['clinic_id'] = int(request.data.get('clinic_id'))
            except (ValueError, TypeError):
                pass
        _save(_CFG_FILE, cfg)
        return Response({'ok': True})
    # GET — tokenni ochib bermaymiz
    cfg = _config()
    return Response({
        'connected': bool(cfg.get('phone_number_id') and cfg.get('access_token')),
        'phone_number_id': cfg.get('phone_number_id', ''),
        'verify_token': cfg.get('verify_token', 'dentical_verify'),
        'has_token': bool(cfg.get('access_token')),
    })


# ------------------------- YUBORISH -------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def send(request):
    cfg = _config()
    pnid = cfg.get('phone_number_id')
    token = cfg.get('access_token')
    if not pnid or not token:
        return Response({'ok': False, 'error': 'not_connected', 'message': 'WhatsApp Cloud API ulanmagan (Sozlamalardan kiriting)'}, status=400)
    to = _digits(request.data.get('phone'))
    text = str(request.data.get('text', '')).strip()
    if len(to) < 10:
        return Response({'ok': False, 'error': 'invalid_phone', 'message': 'Bemor raqami noto‘g‘ri'}, status=400)
    if not text:
        return Response({'ok': False, 'error': 'empty', 'message': 'Xabar bo‘sh'}, status=400)

    url = f'https://graph.facebook.com/{GRAPH_VERSION}/{pnid}/messages'
    payload = json.dumps({
        'messaging_product': 'whatsapp',
        'recipient_type': 'individual',
        'to': to,
        'type': 'text',
        'text': {'preview_url': False, 'body': text},
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode('utf-8'))
        mid = (body.get('messages') or [{}])[0].get('id', str(int(time.time() * 1000)))
        msg = {'id': mid, 'text': text, 'out': True, 'date': _now_iso()}
        _store_message(to, msg)
        return Response({'ok': True, 'message': msg})
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode('utf-8'))
            m = err.get('error', {}).get('message', str(e))
        except Exception:
            m = str(e)
        return Response({'ok': False, 'error': 'graph_error', 'message': m}, status=400)
    except Exception as e:
        return Response({'ok': False, 'error': 'send_failed', 'message': str(e)}, status=500)


# ------------------------- YOZISHMA -------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def chat(request):
    cfg = _config()
    connected = bool(cfg.get('phone_number_id') and cfg.get('access_token'))
    if not connected:
        return Response({'ok': False, 'error': 'not_connected', 'message': 'WhatsApp Cloud API ulanmagan'}, status=400)
    to = _digits(request.data.get('phone'))
    data = _load(_MSG_FILE, {})
    messages = sorted(data.get(to, []), key=lambda m: m.get('date', ''))
    return Response({'ok': True, 'connected': True, 'messages': messages})


# ------------------------- WEBHOOK (kiruvchi + tekshiruv) -------------------------
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def webhook(request):
    cfg = _config()
    if request.method == 'GET':
        # Meta ulanishni tekshiradi
        mode = request.GET.get('hub.mode')
        token = request.GET.get('hub.verify_token')
        challenge = request.GET.get('hub.challenge', '')
        if mode == 'subscribe' and token == cfg.get('verify_token'):
            return HttpResponse(challenge, content_type='text/plain')
        return HttpResponse('forbidden', status=403)

    # POST — kiruvchi xabarlar
    try:
        body = request.data
        for entry in body.get('entry', []):
            for change in entry.get('changes', []):
                value = change.get('value', {})
                for m in value.get('messages', []):
                    frm = _digits(m.get('from'))
                    mtype = m.get('type')
                    text = ''
                    if mtype == 'text':
                        text = m.get('text', {}).get('body', '')
                    else:
                        text = f'[{mtype}]'  # media/boshqa turlar (keyin kengaytiramiz)
                    ts = m.get('timestamp')
                    date = _iso_from_ts(ts)
                    _store_message(frm, {'id': m.get('id'), 'text': text, 'out': False, 'date': date})

                    # --- AI avto-javob / avto-eslatma statusini yangilash ---
                    if text and not text.startswith('['):
                        _handle_inbound_ai(cfg, frm, text)
    except Exception as e:
        print('whatsapp webhook error:', e)
    return Response({'ok': True})


def _handle_inbound_ai(cfg, from_phone, text):
    """Kiruvchi WhatsApp xabarni klinika sozlamasiga qarab AI/eslatma bilan ishlaydi."""
    try:
        from .models import ClinicTenant
        clinic_id = cfg.get('clinic_id')
        if not clinic_id:
            clinic = ClinicTenant.objects.filter(has_ai_agent=True).first() or ClinicTenant.objects.first()
            clinic_id = clinic.id if clinic else None
        if not clinic_id:
            return
        clinic = ClinicTenant.objects.filter(id=clinic_id).first()
        if not clinic:
            return

        # AI agent yoqilgan bo'lsa — to'liq konsultatsiya + zapis
        if clinic.has_ai_agent:
            from .ai_agent import process_ai_inbound_message
            res = process_ai_inbound_message(clinic_id, from_phone, text)
            reply = res.get('reply')
            if reply:
                _send_whatsapp_text(cfg, from_phone, reply)
        # Faqat avto-eslatma yoqilgan bo'lsa — javobga qarab statusni yangilaymiz
        elif clinic.has_auto_reminders:
            from .reminders import process_patient_reply
            res = process_patient_reply(_digits(from_phone), text)
            reply = res.get('reply_message')
            if reply:
                _send_whatsapp_text(cfg, from_phone, reply)
    except Exception as e:
        print('whatsapp AI inbound error:', e)


def _now_iso():
    import datetime
    return datetime.datetime.now().isoformat()


def _iso_from_ts(ts):
    import datetime
    try:
        return datetime.datetime.fromtimestamp(int(ts)).isoformat()
    except Exception:
        return _now_iso()
