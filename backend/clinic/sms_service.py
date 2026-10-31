"""
SMS xizmati (Eskiz.uz / PlayMobile integratsiyasi).
Avto-eslatmalar va klinika xabarlari uchun.
"""
import os
import json
import datetime
import urllib.request
import urllib.parse
from django.conf import settings

_SMS_CFG_FILE = os.path.join(settings.RUNTIME_DIR, 'sms_config.json')
_SMS_LOG_FILE = os.path.join(settings.RUNTIME_DIR, 'sms_sent.json')

_DEFAULT_CFG = {
    'enabled': True,
    'provider': 'eskiz',  # 'eskiz' | 'playmobile' | 'mock'
    'email': '',
    'password': '',
    'token': '',
    'token_expires_at': '',
    'from': '4546'
}


def load_sms_config():
    try:
        with open(_SMS_CFG_FILE, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
            merged = dict(_DEFAULT_CFG)
            merged.update(cfg)
            return merged
    except Exception:
        return dict(_DEFAULT_CFG)


def save_sms_config(cfg):
    try:
        with open(_SMS_CFG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('save_sms_config error:', e)


def _load_logs():
    try:
        with open(_SMS_LOG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def _save_log(entry):
    try:
        logs = _load_logs()
        logs.insert(0, entry)
        # Keep last 500 logs
        logs = logs[:500]
        with open(_SMS_LOG_FILE, 'w', encoding='utf-8') as f:
            json.dump(logs, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print('save sms log error:', e)


def _get_eskiz_token(cfg):
    """Eskiz API tokenni oladi yoki yangilaydi."""
    token = cfg.get('token')
    if token:
        return token
    email = cfg.get('email')
    password = cfg.get('password')
    if not email or not password:
        return None

    try:
        url = 'https://notify.eskiz.uz/api/auth/login'
        data = urllib.parse.urlencode({'email': email, 'password': password}).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            new_token = body.get('data', {}).get('token')
            if new_token:
                cfg['token'] = new_token
                save_sms_config(cfg)
                return new_token
    except Exception as e:
        print('Eskiz auth error:', e)
    return None


def send_sms(phone: str, text: str) -> dict:
    """
    Bemorga SMS yuboradi.
    Haqiqiy provayder ulangan bo'lsa API orqali yuboradi,
    bo'lmasa simulyatsiya qilib tizim jurnaliga qayd etadi.
    """
    cfg = load_sms_config()
    clean_phone = ''.join(ch for ch in phone if ch.isdigit())
    if not clean_phone:
        return {'ok': False, 'error': 'invalid_phone', 'message': 'Telefon raqami bo‘sh'}

    now_str = datetime.datetime.now().isoformat()
    log_entry = {
        'id': f'sms_{int(datetime.datetime.now().timestamp() * 1000)}',
        'phone': phone,
        'text': text,
        'sent_at': now_str,
        'provider': cfg.get('provider', 'eskiz'),
        'status': 'sent'
    }

    token = _get_eskiz_token(cfg)
    if token and cfg.get('provider') == 'eskiz':
        try:
            url = 'https://notify.eskiz.uz/api/message/sms/send'
            payload = urllib.parse.urlencode({
                'mobile_phone': clean_phone,
                'message': text,
                'from': cfg.get('from', '4546')
            }).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = json.loads(resp.read().decode('utf-8'))
                log_entry['provider_response'] = body
                log_entry['status'] = 'delivered'
        except Exception as e:
            print('Eskiz send failed:', e)
            log_entry['status'] = 'queued_or_logged'
            log_entry['error'] = str(e)
    else:
        # Dev / unconfigured mode: record as successfully logged to SMS outbox
        log_entry['status'] = 'logged_ready'
        log_entry['note'] = 'SMS yuborish navbatiga olindi (Eskiz token kiritilganda real yuboriladi)'

    _save_log(log_entry)
    return {'ok': True, 'log': log_entry}
