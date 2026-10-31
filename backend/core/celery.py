"""Celery ilovasi — broker/natija Redis'da. Konfiguratsiya Django settings'dan
CELERY_ namespace bilan o'qiladi. Vazifalar clinic/tasks.py'da (autodiscover)."""
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

app = Celery('dentos')
# settings.py'dagi CELERY_* kalitlari (masalan CELERY_BROKER_URL) shu app'ni sozlaydi.
app.config_from_object('django.conf:settings', namespace='CELERY')
# Har bir INSTALLED_APPS ichidagi tasks.py avtomatik topiladi.
app.autodiscover_tasks()
