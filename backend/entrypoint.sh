#!/bin/sh
set -eu
umask 077
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  START_BACKGROUND_SERVICES=false python manage.py migrate --noinput
  START_BACKGROUND_SERVICES=false python manage.py collectstatic --noinput
fi
if [ "$#" -gt 0 ]; then exec "$@"; fi
# Telethon sessiyalari FAQAT 'telegram' xizmatida (START_BACKGROUND_SERVICES=true, 1 nusxa)
# ochiladi. 'api' xizmatida START_BACKGROUND_SERVICES=false — shuning uchun u Telegram'ni
# ochmaydi va GUNICORN_WORKERS'ni xavfsiz ko'paytirsa bo'ladi. Default 1 (orqaga moslik +
# Telegram egasi uchun bitta jarayon kafolati).
WORKERS="${GUNICORN_WORKERS:-1}"
THREADS="${GUNICORN_THREADS:-8}"
exec gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers "$WORKERS" --worker-class gthread --threads "$THREADS" --timeout 330 --graceful-timeout 30 --access-logfile - --error-logfile -
