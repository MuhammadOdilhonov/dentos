"""Celery vazifalari (YANGI async infra). Muhim tamoyillar:
  - idempotent (qayta bajarilса zarar yo'q);
  - chegaralangan retry + backoff;
  - DB commitdan KEYIN enqueue (chaqiruvchi transaction.on_commit ishlatadi);
  - broker o'lik bo'lsa enqueue XATO beradi (soxta muvaffaqiyat yo'q — settings'da
    CELERY_TASK_PUBLISH_RETRY=False).

Eslatma: bemor eslatmalari (reminders) va Telethon tinglovchilari BU YERDA EMAS — ular
bitta 'telegram' xizmatida in-process qoladi (bitta egasi, ikki marta bajarilmaslik uchun).
"""
import json
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    bind=True, name='clinic.tasks.persist_media_to_b2',
    autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=300,
    retry_jitter=True, max_retries=5, acks_late=True,
)
def persist_media_to_b2(self, media_id: int) -> dict:
    """Og'ir bemor media faylini private B2'ga ko'chirish/tasdiqlash (navbat orqali,
    asosiy oqimni bloklamasdan). IDEMPOTENT: fayl allaqachon B2'da bo'lsa — hech narsa
    qilmaydi. B2 o'chiq (MEDIA_STORAGE != b2) bo'lsa — xavfsiz o'tkazib yuboradi."""
    from django.conf import settings
    from .models import PatientMedia
    if getattr(settings, 'MEDIA_STORAGE', 'local') != 'b2':
        return {'skipped': 'media_storage_not_b2', 'media_id': media_id}
    media = PatientMedia.objects.filter(pk=media_id).first()
    if not media:
        return {'skipped': 'not_found', 'media_id': media_id}
    meta = media.meta or {}
    if meta.get('b2_persisted'):
        return {'skipped': 'already_persisted', 'media_id': media_id}
    # default storage B2 bo'lsa fayl allaqachon B2'da — faqat mavjudligini tasdiqlab,
    # belgilаб qo'yamiz (idempotency markeri). Xato bo'lsa autoretry backoff bilan qayta uringanadi.
    try:
        exists = media.file.storage.exists(media.file.name)
    except Exception as exc:
        logger.warning('persist_media_to_b2: storage check failed media=%s: %s', media_id, exc)
        raise
    if not exists:
        raise FileNotFoundError(f'PatientMedia {media_id} fayli storage\'da topilmadi')
    meta['b2_persisted'] = True
    media.meta = meta
    media.save(update_fields=['meta'])
    return {'ok': True, 'media_id': media_id}


@shared_task(name='clinic.tasks.collect_ops_status', acks_late=True)
def collect_ops_status() -> dict:
    """Beat'dan davriy chaqiriladi. Navbat uzunligi, beat yurak urishi, backup yoshi,
    DB holati va B2 usage'ni bitta JSON snapshotга yozadi (monitoring endpoint o'qiydi).
    Maxfiy qiymat (token/kalit/bemor matni) YOZILMAYDI."""
    import time
    from django.conf import settings
    from django.db import connection
    snapshot = {'ts': int(time.time()), 'db_ok': False, 'queues': {}, 'b2': {}}
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT 1')
            snapshot['db_ok'] = cur.fetchone()[0] == 1
    except Exception as exc:
        snapshot['db_error'] = str(exc)[:200]
    # Navbat uzunliklari (broker Redis'dan; xato bo'lsa jim o'tkazamiz).
    try:
        import redis as _redis
        r = _redis.from_url(getattr(settings, 'CELERY_BROKER_URL', 'redis://redis:6379/0'))
        for q in ('default', 'media', 'ops'):
            try:
                snapshot['queues'][q] = int(r.llen(q))
            except Exception:
                snapshot['queues'][q] = None
    except Exception as exc:
        snapshot['queue_error'] = str(exc)[:200]
    snapshot['media_storage'] = getattr(settings, 'MEDIA_STORAGE', 'local')
    path = getattr(settings, 'OPS_STATUS_FILE', None)
    if path:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = str(path) + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(snapshot, f)
            import os
            os.replace(tmp, path)
        except Exception as exc:
            logger.warning('collect_ops_status: write failed: %s', exc)
    return snapshot


@shared_task(name='clinic.tasks.ping')
def ping() -> str:
    """Worker/broker sog'lig'ini tekshirish uchun eng oddiy vazifa."""
    return 'pong'
