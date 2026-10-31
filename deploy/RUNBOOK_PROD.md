# Dentos — Production RUNBOOK (server: Ubuntu 24.04 LTS)

> Arxitektura: Foydalanuvchi → HTTPS/Proxy → Next(frontend) + Django/Gunicorn(api) → Postgres;
> Redis → Celery worker + bitta Beat; Telethon+eslatmalar bitta `telegram` xizmatida; media → (keyin) private B2.
> Bu yo'riqnoma **serverda** bajariladi. Lokalda hamma konfig tayyor; faqat server+Docker qoldi.
> ⚠️ Pullik yoki buzuvchi qadamlardan OLDIN to'xtab tasdiqlang. Real bemor ma'lumoti B2'ga
> `B2_MEDICAL_STORAGE_APPROVED=true` + huquqiy moslik hujjatlanmaguncha YUKLANMAYDI.

## 0. Siz beradigan narsalar
- Server IP (CX53, EU region — panelda CPU/RAM/disk tasdiqlangan) va tasdiqlangan SSH IP/CIDR.
- DNS panel kirishi (dentos.cc).
- (Keyin) Backblaze app key + bucket faktlari — B2 yoqilganda.

## 1. Server bootstrap + SSH
```bash
# root (yoki Hetzner boshlang'ich user) sifatida:
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
# O'z public kalitingizni qo'ying:
echo "ssh-ed25519 AAAA... sizning_kalit" > /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh
# SSH qattiqlash:
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh
```
**⚠️ 22-portni cheklashdan OLDIN:** YANGI terminalda `ssh deploy@SERVER_IP` bilan ulanishni
tasdiqlang. Ishlamasa — eski sessiyani YOPMANG va sozlamani to'g'rilang (o'zingizni uzib qo'ymang).

## 2. Firewall (UFW) — 22 faqat sizning IP'dan; 80/443 ochiq; 3000/8000/5432/6379 YOPIQ
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <SIZNING_IP_yoki_CIDR> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# 3000/8000/5432/6379 — Docker ichki tarmog'ida, tashqariga chiqarilmaydi (compose'da port yo'q).
sudo ufw enable
sudo ufw status verbose
```
> Docker ba'zan UFW'ni chetlab o'tadi — compose'da bu portlar `expose` (publish EMAS), shuning
> uchun host interfeysiga chiqmaydi. `ss -tlnp` bilan 5432/6379/8000/3000 FAQAT docker-proxy
> ichida ekanini tasdiqlang (0.0.0.0'da emas).

## 3. Docker + repo + .env
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy    # qayta login
git clone <repo> /home/deploy/dentos && cd /home/deploy/dentos
cp .env.example .env
# SECRET_KEY (>=50) va parollar:
python3 -c "import secrets; print('SECRET_KEY='+secrets.token_urlsafe(64))"
# .env ni to'ldiring: SECRET_KEY, POSTGRES_PASSWORD, ACME_EMAIL, GRAFANA_ADMIN_PASSWORD,
# BACKUP_ENCRYPTION_PASSPHRASE, TELEGRAM_* (login bot). B2_* BO'SH qoladi (approval=false).
```

## 4. DNS (hozir: dentos.cc → 185.196.212.52 boshqa host; backend.dentos.cc YO'Q)
- `dentos.cc` A → SERVER_IP (eski 185.196.212.52 ni OLIB TASHLANG); AAAA → server IPv6 (bo'lmasa AAAA qo'ymang — noto'g'ri IPv6 qolmasin).
- `backend.dentos.cc` A → SERVER_IP (hozir mavjud emas — YARATING).
- Tarqalishini kuting: `dig +short dentos.cc`, `dig +short backend.dentos.cc`.

## 5. Ishga tushirish (Caddy yo'li — eng sodda avto-TLS)
```bash
docker compose up -d --build        # db, redis, api(migrate+collectstatic), telegram, worker, beat, frontend, proxy(Caddy)
docker compose ps                   # hammasi healthy/running
docker compose logs -f api | head   # migratsiya tugaganini ko'ring
# Superadmin (parol env'dan, logga chiqmaydi):
DJANGO_ADMIN_PASSWORD='<kuchli>' docker compose exec -e DJANGO_ADMIN_PASSWORD api python manage.py create_admin --username <admin@domen>
# Telegram login bot (ixtiyoriy):
docker compose --profile telegram up -d login-bot
```

## 6. Qabul testlari (proxy bilan, § topshiriq 7)
```bash
curl -I https://dentos.cc/                      # 200/301→200
curl -s -o /dev/null -w "%{http_code}\n" https://dentos.cc/api/health/     # 200
curl -s -o /dev/null -w "%{http_code}\n" https://backend.dentos.cc/api/health/  # 200
curl -s -o /dev/null -w "%{http_code}\n" https://dentos.cc/api/auth/me/    # 401 (unauth)
```
Brauzerda: login/CSRF/logout; rollar + klinika izolyatsiyasi; foto/rentgen/skan upload→save→
reload→authorized download; restartdan keyin (`docker compose restart`) ma'lumot+sessiya saqlanishi;
Celery: `docker compose exec worker celery -A core inspect ping` va `inspect active`.

## 7. Caddy → Nginx (ixtiyoriy, rollback bilan) — IKKALASI bir paytda 80/443ga chiqmaydi
```bash
# Sertifikatlarni BIRINCHI marta olish (nginx ishlamay turganda, standalone):
docker compose stop proxy
docker run --rm -p 80:80 -v dentos_letsencrypt:/etc/letsencrypt -v dentos_certbot_www:/var/www/certbot \
  certbot/certbot certonly --standalone -d dentos.cc -d backend.dentos.cc --agree-tos -m <ACME_EMAIL> -n
# Nginx'ga o'tish:
docker compose -f docker-compose.yml -f docker-compose.nginx.yml --profile nginx up -d
curl -s -o /dev/null -w "%{http_code}\n" https://dentos.cc/api/health/     # 200
# ROLLBACK (Caddy'ga qaytish):
docker compose -f docker-compose.yml -f docker-compose.nginx.yml --profile nginx down
docker compose up -d                 # Caddy qayta 80/443 ni oladi
```
> Eslatma: volume nomlari `dentos_letsencrypt`/`dentos_certbot_www` (compose project `dentos`).

## 8. Monitoring (panellar FAQAT localhost — SSH tunnel bilan)
```bash
cd deploy/monitoring
# Asosiy stek tarmog'iga ulanish uchun network'ni tashqi qiling yoki bitta project'da ishga tushiring.
docker compose --env-file ../../.env -f docker-compose.monitoring.yml up -d
# Grafana'ga kirish (lokal): ssh -L 3001:127.0.0.1:3001 deploy@SERVER_IP  → http://localhost:3001
# Prometheus: ssh -L 9090:127.0.0.1:9090 ...
```
Alert kanali (Telegram/email) sizning tanlovingiz bilan Alertmanager orqali qo'shiladi.
Loglarda token/sessiya/bemor matni/imzolangan URL CHIQMASLIGINI tasdiqlang.

## 9. Backup / restore
```bash
# Cron (har kuni 03:30, serverda):
30 3 * * * cd /home/deploy/dentos && ./deploy/backup.sh >> backups/cron.log 2>&1
# Restore'ni ALOHIDA bazada sinang (productionni bosmasdan):
openssl enc -d -aes-256-cbc -pbkdf2 -in backups/<stamp>/postgres.dump.enc -pass pass:"$BACKUP_ENCRYPTION_PASSPHRASE" -out /tmp/pg.dump
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" restore_test'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d restore_test' < /tmp/pg.dump
# Shifrlangan arxivlarni server TASHQARISIGA ko'chiring (bitta server = disaster backup EMAS).
# Avtomatik o'chirish YO'Q — retention qo'lda/kelishilgan; tibbiy saqlash muddatini buzmang.
```

## 10. Rollback (deploy)
```bash
git -C /home/deploy/dentos log --oneline -5
git checkout <oldingi_tag_yoki_commit>
docker compose up -d --build
# Yoki xizmatni to'xtatish: docker compose stop <service>
```

## 11. Yuklama testi (150 foydalanuvchi MAQSAD — kafolat emas)
- Sintetik ma'lumot + alohida test klinikasi. "150 faol" ≠ "150 bir vaqtdagi so'rov".
- k6/locust bilan bosqichli (10→50→100→150 virtual user), tipik oqim: login→dashboard→patients→foto ko'rish.
- O'lchang: p95 latency, error rate, CPU/RAM, PostgreSQL ulanishlari, Celery queue uzunligi/yoshi.
- `GUNICORN_WORKERS`/`--concurrency`/Postgres `max_connections`ni natijaga qarab moslang.
- Natijasiz "CX53 yetadi" DEYILMAYDI.

## 12. B2 yoqish (FAQAT huquqiy moslik + approval hujjatlangach)
- `.env`: `B2_KEY_ID`, `B2_APPLICATION_KEY`, haqiqiy `B2_BUCKET_NAME`/`B2_REGION`/`B2_ENDPOINT`
  (konsoldan tasdiqlangan — example qiymatlar emas), `MEDIA_STORAGE=b2`, `B2_MEDICAL_STORAGE_APPROVED=true`.
- App key FAQAT o'sha bucket'ga (master key EMAS). Bucket PRIVATE + SSE-B2. Billing cap/alert yoqilgan.
- `docker compose up -d api worker` → sintetik fayl bilan upload→download→authorization rad testlari.
- Browser→B2 to'g'ridan ishlatilmasa bucket CORS'ni ochmang; kerak bo'lsa aniq origin, wildcard EMAS.
