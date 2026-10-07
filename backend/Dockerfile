FROM python:3.12-slim

# Python optimallashtirish
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Tizim kutubxonalari (psycopg2, Pillow uchun)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev libjpeg-dev zlib1g-dev netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Bog'liqliklar (kesh qatlami)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Loyiha kodi
COPY . .

RUN chmod +x /app/entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
