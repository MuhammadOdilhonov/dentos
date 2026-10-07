#!/bin/sh
set -e

# PostgreSQL tayyor bo'lguncha kutish
if [ -n "$POSTGRES_HOST" ]; then
  echo "PostgreSQL ($POSTGRES_HOST:$POSTGRES_PORT) kutilyapti..."
  while ! nc -z "$POSTGRES_HOST" "${POSTGRES_PORT:-5432}"; do
    sleep 0.5
  done
  echo "PostgreSQL tayyor."
fi

# Migratsiyalar + statik fayllar
python manage.py migrate --noinput
python manage.py collectstatic --noinput || true

# Gunicorn bilan ishga tushirish
exec gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120
