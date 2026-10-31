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

## 12. Backblaze B2 (private media) — konsol → server → test
> Kod TAYYOR va TO'G'RI (`clinic/storage.py` PrivateB2Storage: SSE AES256, private, 300s imzolangan
> URL, checksum; `PatientMediaViewSet` klinika-scoping + backend-proxy download). Ikkinchi integratsiya
> YOZILMAYDI. Qolgani — konsol + env + sinov. `B2_MEDICAL_STORAGE_APPROVED` huquqiy moslik +
> sintetik sinovdan OLDIN `true` qilinmaydi.

### 12.1 Backblaze konsol (siz qilasiz — men kira olmayman; parolni chatga yozmang)
1. Mavjud hisobni tekshiring. Yangi hisob/bucket KERAK bo'lsagina yarating (dentical'ni O'CHIRMANG).
2. Bucket: **`dentos`** (dentical emas). Agar `dentos` band bo'lsa — o'zboshimcha boshqa nom tanlamang, menga ayting.
   - **Private** (Public emas).
   - **Default Encryption: SSE-B2 (AES-256)** yoqilgan.
   - **Object Lock** — tekshirmasdan yoqmang (tibbiy saqlash muddati aniqlanmaguncha).
3. Region/endpoint'ni **konsoldan aniq** oling (taxmin emas). S3 endpoint `https://s3.<region>.backblazeb2.com` ko'rinishida.
4. **Application Key** (App Keys → Add a New Application Key):
   - **Allow access to Bucket:** faqat `dentos` (hammasi EMAS).
   - **Type:** Read and Write (+ List). **Master key ISHLATMANG.**
   - **Delete** huquqi faqat zarur bo'lsa (CRM destroy B2 versiyasini o'chirmaydi — odatda delete KERAK EMAS).
   - `keyID` + `applicationKey` ni BIR MARTA ko'rsatadi — faqat serverda saqlang (chat/Git/log/screenshot'ga EMAS).
5. **Caps & Alerts** (Account → Caps & Alerts): oylik byudjetga mos storage/download/transaction cap + email alert.
   Cap'ga yetganda: storage cap → **upload** bloklanadi; download cap → **download** bloklanadi (403). Raqamni SIZ berasiz.

### 12.2 Server `.env` (real qiymatlar, kalit faqat shu yerda)
```bash
cd /opt/dentos
nano .env
# To'ldiring (konsoldan):
#   B2_BUCKET_NAME=dentos
#   B2_REGION=<konsoldagi region>
#   B2_ENDPOINT=https://s3.<region>.backblazeb2.com
#   B2_KEY_ID=<keyID>
#   B2_APPLICATION_KEY=<applicationKey>
# HOZIRCHA O'ZGARTIRMANG (sinovgacha va huquqiy moslikkacha):
#   MEDIA_STORAGE=local
#   B2_MEDICAL_STORAGE_APPROVED=false
grep -E "^(B2_|MEDIA_STORAGE)" .env   # kalit qiymatini EKRANGA chiqarmang jamoada
```

### 12.3 Sintetik sinov (ALOHIDA, production himoyasini chetlab o'tmasdan; REAL bemor fayli EMAS)
Sinov uchun vaqtincha b2 + approval'ni FAQAT serverda yoqib, SINTETIK fayl bilan tekshiramiz:
```bash
# Vaqtincha sinov qiymatlari (faqat shu sessiya uchun — .env'ni o'zgartirmasdan ham mumkin):
docker compose exec -e MEDIA_STORAGE=b2 -e B2_MEDICAL_STORAGE_APPROVED=true api python manage.py shell -c "
from clinic.storage import PrivateB2Storage
from django.core.files.base import ContentFile
import hashlib
s = PrivateB2Storage()
data = b'DENTOS SYNTHETIC TEST ' + b'x'*1024
name = s.save('selftest/hello.txt', ContentFile(data))
back = s.open(name).read()
print('upload+download OK:', hashlib.sha256(data).hexdigest()==hashlib.sha256(back).hexdigest())
print('exists:', s.exists(name)); s.delete(name); print('cleaned:', not s.exists(name))
"
```
Natija `upload+download OK: True` bo'lsa — ulanish + SSE + checksum ishlaydi. Noto'g'ri kalit/timeout/cap bo'lsa — aniq xato chiqadi (soxta "OK" yo'q).

### 12.4 Productionga o'tkazish (FAQAT 12.3 OK + huquqiy moslik hujjatlangach)
```bash
sed -i "s|^MEDIA_STORAGE=.*|MEDIA_STORAGE=b2|" .env
sed -i "s|^B2_MEDICAL_STORAGE_APPROVED=.*|B2_MEDICAL_STORAGE_APPROVED=true|" .env
docker compose up -d api worker telegram beat
# Brauzerда (test klinika): foto upload → reload → authorized download → boshqa klinikadan 404 tekshiring.
```

### 12.5 CORS / kalit almashtirish / xato tekshirish
- Oqim **browser → backend → B2**, shuning uchun bucket **CORS KERAK EMAS**. To'g'ridan browser→B2 kerak bo'lmasa CORS'ni ochmang. Kerak bo'lsa: faqat `https://dentos.cc`, aniq method/header; **wildcard YO'Q**.
- **Kalit almashtirish (rotation):** konsolда yangi app key yarating (bucket-only) → `.env`da `B2_KEY_ID`/`B2_APPLICATION_KEY`ni yangilang → `docker compose up -d api worker telegram beat` → 12.3 self-test → eski kalitni konsolда o'chiring. Kalitni 6–12 oyда yoki xodim ketganda almashtiring.
- **Ulanish xatosini tekshirish:** `docker compose logs --tail=50 api | grep -iE "b2|s3|botocore|credential|endpoint"`; self-test (12.3) qayta ishlating.
- **CRM kvota ≠ B2 billing cap:** klinika `storage_quota_gb` (CRM) va B2 Caps alohida. Ikkalasini davriy solishtiring (monitoring `collect_ops_status` + konsol usage).
