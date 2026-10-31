# Core package
# Celery ilovasini Django ishga tushganda yuklaymiz (shared_task'lar shu app'ga bog'lanadi).
# Guard: celery o'rnatilmagan muhitda (ba'zi lokal/test) Django baribir ishlaydi.
try:
    from .celery import app as celery_app
    __all__ = ('celery_app',)
except ModuleNotFoundError:  # pragma: no cover
    celery_app = None
