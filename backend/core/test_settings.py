from .settings import *

# Tests never use the real clinic database or send scheduled messages.
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
START_BACKGROUND_SERVICES = False
ALLOWED_HOSTS = ['testserver', 'localhost', '127.0.0.1']
TELEGRAM_LOGIN_BOT_TOKEN = 'test-token-not-a-real-secret'
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

DEBUG = True
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
# Legacy conversation tests use isolated service calls; security tests enable this.
ENFORCE_API_AUTH = False
MEDIA_STORAGE = 'local'
STORAGES['default'] = {'BACKEND': 'django.core.files.storage.InMemoryStorage'}
