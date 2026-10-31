#!/bin/sh
set -eu
umask 077
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
mkdir -p backups
# Prevent concurrent backups; retain an incomplete directory if any step fails.
mkdir backups/.lock || { echo 'Another backup is running (or stale lock needs inspection).' >&2; exit 1; }

# Pause ALL writers (api, telegram-owner, celery worker/beat, login-bot) so the Postgres
# dump and local files describe the same point in time. db stays up for pg_dump. Celery/Beat/
# Telethon ajratilgach ro'yxat shunga moslandi (eski versiya faqat backend+login-botni to'xtatardi).
running=$(docker compose ps --services --status running | sed -n '/^api$/p; /^telegram$/p; /^worker$/p; /^beat$/p; /^login-bot$/p')
resume() {
  if [ -n "$running" ]; then docker compose start $running; fi
  rmdir backups/.lock
}
trap resume EXIT
trap 'exit 1' INT TERM
if [ -n "$running" ]; then docker compose stop $running; fi

stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir "backups/$stamp"

# 1) Postgres (custom format — pg_restore --list bilan tasdiqlanadi)
target="backups/$stamp/postgres.dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$target.tmp"
test -s "$target.tmp"
mv "$target.tmp" "$target"
docker compose exec -T db sh -c 'pg_restore --list' < "$target" > /dev/null

# 2) Local fayllar: media + telegram_media + runtime (Telethon sessiyalari shu yerda — MAXFIY).
docker compose run --rm --no-deps -T --entrypoint tar api -czf - -C /app media telegram_media runtime > "backups/$stamp/files.tgz.tmp"
tar -tzf "backups/$stamp/files.tgz.tmp" > /dev/null
mv "backups/$stamp/files.tgz.tmp" "backups/$stamp/files.tgz"

# 3) Shifrlash (BACKUP_ENCRYPTION_PASSPHRASE berilgan bo'lsa) — AES-256, PBKDF2. Telethon
#    sessiyalari va bemor ma'lumoti shifrsiz saqlanmasin. Parol .env'da (serverda), Git'da emas.
PASS="$(grep -E '^BACKUP_ENCRYPTION_PASSPHRASE=' .env 2>/dev/null | cut -d= -f2- || true)"
if [ -n "${PASS:-}" ]; then
  for f in postgres.dump files.tgz; do
    openssl enc -aes-256-cbc -pbkdf2 -salt -in "backups/$stamp/$f" -out "backups/$stamp/$f.enc" -pass "pass:$PASS"
    rm -f "backups/$stamp/$f"
  done
  (cd "backups/$stamp" && sha256sum postgres.dump.enc files.tgz.enc > SHA256SUMS)
  echo "Encrypted backup: backups/$stamp (AES-256)"
else
  (cd "backups/$stamp" && sha256sum postgres.dump files.tgz > SHA256SUMS)
  echo "WARNING: BACKUP_ENCRYPTION_PASSPHRASE bo'sh — backup SHIFRLANMADI. Productionda to'ldiring." >&2
fi
touch "backups/$stamp/COMPLETE"
echo "Database and local files archived: backups/$stamp (brief maintenance pause)"
# No automatic deletion and no unapproved off-site upload. Retention + offsite: deploy/RUNBOOK_PROD.md.
# Single-server copy is NOT a disaster backup — copy encrypted archives off-box per RUNBOOK.
