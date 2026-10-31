"""VAQTINCHALIK tekshiruv sozlamasi — disposable SQLite bazasi (dev db.sqlite3 ga TEGMAYDI).
Tekshiruvdan keyin bu fayl va verify.sqlite3 o'chiriladi."""
import os
os.environ.setdefault('DEBUG', 'True')
os.environ.setdefault('POSTGRES_DB', '')
from core.settings import *  # noqa

DEBUG = True
BASE_DIR_VERIFY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASES['default']['NAME'] = os.path.join(BASE_DIR_VERIFY, 'verify.sqlite3')
# WAL + busy_timeout + IMMEDIATE sozlamalari core.settings dan meros bo'ladi.
