import os
from pathlib import Path

# .env faylini yuklash (lokal ishlash uchun; Docker env'ni to'g'ridan beradi)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent.parent / '.env')
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-32desk-clinic-crm-key-$v!o8#v7)m!1+!w1e(y)'
)

DEBUG = os.environ.get('DEBUG', 'True').lower() in ('1', 'true', 'yes')

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

# Telegram (Telethon) API kalitlar — env'dan (telegram_auth.py shu yerdan oladi)
TELEGRAM_API_ID = os.environ.get('TELEGRAM_API_ID', '')
TELEGRAM_API_HASH = os.environ.get('TELEGRAM_API_HASH', '')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'corsheaders',
    # Local apps
    'clinic.apps.ClinicConfig',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'clinic.access.AccountMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

# Docker ichidami? (compose/Dockerfile IN_DOCKER=1 beradi; yoki /.dockerenv mavjud)
IN_DOCKER = os.environ.get('IN_DOCKER') == '1' or os.path.exists('/.dockerenv')

# PostgreSQL yoki SQLite tanlash:
#   - Docker ichida  → Postgres (host "db" docker tarmog'ida hal bo'ladi)
#   - Lokal (Docker'siz) va host "db" bo'lsa → SQLite (chunki "db" nomi faqat
#     Docker tarmog'ida mavjud, Windows/host'da hal bo'lmaydi → shuning uchun
#     `python manage.py runserver` lokal to'g'ridan-to'g'ri ishlaydi)
#   - Lokal, lekin POSTGRES_HOST aniq berilgan (masalan localhost) → Postgres
_pg_host = os.environ.get('POSTGRES_HOST', 'db')
_use_postgres = bool(os.environ.get('POSTGRES_DB')) and (IN_DOCKER or _pg_host != 'db')

if _use_postgres:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ['POSTGRES_DB'],
            'USER': os.environ.get('POSTGRES_USER', 'postgres'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
            'HOST': os.environ.get('POSTGRES_HOST', 'db'),
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
            # SQLite bir vaqtda ko'p yozishda "database is locked" beradi. WAL rejimi
            # o'qish-yozishni parallel qiladi, busy_timeout esa qulf band bo'lsa XATO
            # BERMASDAN kutadi (20s). transaction_mode=IMMEDIATE yozuvchi tranzaksiya
            # darhol qulf oladi — deferred'dan upgrade paytidagi deadlock yo'qoladi.
            'OPTIONS': {
                'timeout': 20,
                'transaction_mode': 'IMMEDIATE',
                'init_command': (
                    'PRAGMA journal_mode=WAL;'
                    'PRAGMA synchronous=NORMAL;'
                    'PRAGMA busy_timeout=20000;'
                    'PRAGMA foreign_keys=ON;'
                ),
            },
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = False

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [v.strip() for v in os.environ.get('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',') if v.strip()]
CORS_ALLOW_CREDENTIALS = True

# Frontend X-Clinic-ID custom header'ini yuboradi — preflight (OPTIONS) uchun
# ruxsat etilgan header'lar ro'yxatiga qo'shamiz, aks holda brauzer so'rovni bloklaydi
# va barcha ma'lumotlar mock'ga tushib qoladi.
from corsheaders.defaults import default_headers
CORS_ALLOW_HEADERS = list(default_headers) + ['x-clinic-id', 'x-dentos-request']
CORS_EXPOSE_HEADERS = ['x-clinic-id']

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['clinic.access.AccountAuthentication', 'rest_framework.authentication.SessionAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': [
        # Demo klinika (id=1) — faqat ko'rish; boshqalari to'liq ishlaydi.
        'clinic.permissions.BlockDemoWrites',
        'clinic.access.TenantPermission',
    ],
    'DEFAULT_PAGINATION_CLASS': None,
}

# Dedicated Telegram login bot. Never expose this token through NEXT_PUBLIC_*.
TELEGRAM_LOGIN_BOT_TOKEN = os.environ.get('TELEGRAM_LOGIN_BOT_TOKEN', '')
TELEGRAM_LOGIN_BOT_USERNAME = os.environ.get('TELEGRAM_LOGIN_BOT_USERNAME', 'dentosccbot')

# Disable network background workers during maintenance or isolated checks.
START_BACKGROUND_SERVICES = os.environ.get('START_BACKGROUND_SERVICES', 'true').lower() in ('1', 'true', 'yes')

# ── Celery / Redis ────────────────────────────────────────────────────────────
# Broker + natija backend bitta PERSISTENT (AOF) va NOEVICTION Redis'da bo'ladi —
# navbatdagi vazifalar xotira to'lganda O'CHIRILMASIN. (Agar keyin cache kerak bo'lsa,
# ALOHIDA Redis instansiyasi — eviction bilan — ishlatilsin, broker bilan aralashmasin.)
REDIS_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', REDIS_URL)
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', os.environ.get('REDIS_RESULT_URL', 'redis://redis:6379/1'))
CELERY_TASK_DEFAULT_QUEUE = 'default'
# Og'ir fayl ishlovi va rejalashtirilgan ishlar ALOHIDA navbatlarda.
CELERY_TASK_ROUTES = {
    'clinic.tasks.persist_media_to_b2': {'queue': 'media'},
    'clinic.tasks.collect_ops_status': {'queue': 'ops'},
}
CELERY_TASK_ACKS_LATE = True                 # vazifa TUGAGACH ack — worker o'lsa qayta bajariladi
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1        # chegaralangan concurrency — bitta-bitta oladi
CELERY_TASK_TIME_LIMIT = 600                 # qattiq timeout (s)
CELERY_TASK_SOFT_TIME_LIMIT = 540            # yumshoq timeout — toza to'xtash
CELERY_TASK_TRACK_STARTED = True
CELERY_RESULT_EXPIRES = 86400
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
# Enqueue paytida broker o'lik bo'lsa — SOXTA muvaffaqiyat bermaymiz, xato ko'tariladi.
CELERY_TASK_PUBLISH_RETRY = False
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = False
# Beat FAQAT bitta nusxa ishlashi kerak (compose'da bitta 'beat' xizmati). Bu yerdagi jadval
# YANGI, mavjud in-process scheduler bilan takrorlanmaydigan ishlar uchun (reminders EMAS —
# reminders bitta 'telegram' xizmatida in-process qoladi, ikki marta bajarilmasin).
CELERY_BEAT_SCHEDULE = {
    'collect-ops-status-every-minute': {
        'task': 'clinic.tasks.collect_ops_status',
        'schedule': 60.0,
    },
}
# Monitoring ops snapshot fayli (navbat/beat/backup/B2 holati).
OPS_STATUS_FILE = Path(os.environ.get('RUNTIME_DIR', str(BASE_DIR))) / 'ops_status.json'


# Deployment defaults. Never silently fall back to SQLite in production.
ENFORCE_API_AUTH = True
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = not DEBUG
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_REFERRER_POLICY = 'same-origin'
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
MAX_PATIENT_FILE_BYTES = int(os.environ.get('MAX_PATIENT_FILE_BYTES', 512 * 1024 * 1024))
RUNTIME_DIR = Path(os.environ.get('RUNTIME_DIR', str(BASE_DIR)))
MEDIA_STORAGE = os.environ.get('MEDIA_STORAGE', 'local')
B2_KEY_ID = os.environ.get('B2_KEY_ID', '')
B2_APPLICATION_KEY = os.environ.get('B2_APPLICATION_KEY', '')
B2_BUCKET_NAME = os.environ.get('B2_BUCKET_NAME', 'dentos')
B2_REGION = os.environ.get('B2_REGION', 'eu-central-003')
B2_ENDPOINT = os.environ.get('B2_ENDPOINT', 'https://s3.eu-central-003.backblazeb2.com')
B2_MEDICAL_STORAGE_APPROVED = os.environ.get('B2_MEDICAL_STORAGE_APPROVED', 'false').lower() == 'true'
STORAGES = {
    'default': {'BACKEND': 'clinic.storage.PrivateB2Storage' if MEDIA_STORAGE == 'b2' else 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}
if not DEBUG and os.environ.get('DJANGO_SETTINGS_MODULE') != 'core.test_settings':
    from django.core.exceptions import ImproperlyConfigured
    if not _use_postgres:
        raise ImproperlyConfigured('Production requires PostgreSQL. Configure POSTGRES_DB and POSTGRES_HOST.')
    if len(SECRET_KEY) < 50 or SECRET_KEY.startswith(('django-insecure', 'change-me')):
        raise ImproperlyConfigured('Set a unique SECRET_KEY of at least 50 characters.')
    if '*' in ALLOWED_HOSTS:
        raise ImproperlyConfigured('Set explicit ALLOWED_HOSTS, e.g. dentos.cc,localhost,127.0.0.1.')
    if MEDIA_STORAGE == 'b2' and (not B2_MEDICAL_STORAGE_APPROVED or not B2_KEY_ID or not B2_APPLICATION_KEY):
        raise ImproperlyConfigured('B2 needs credentials and documented medical-storage approval.')
