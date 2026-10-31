# ============================================================================
#  DentOS (32desk) — ishonchli LOKAL ishga tushirish (Windows / PowerShell)
# ============================================================================
#  Ishlatish:
#     .\start-local.ps1                 # backend + frontend
#     .\start-local.ps1 -WithBot        # + Telegram login bot (bitta polling)
#     .\start-local.ps1 -SkipMigrate    # migratsiyani o'tkazib yuborish
#
#  Tamoyillar:
#   - Hamma jarayon loyiha .venv (bir xil Python/dependency) ishlatadi.
#   - Yo'llar shu skript joylashuviga NISBATAN hisoblanadi.
#   - Lokal DEBUG FAQAT shu jarayonlarga beriladi (umumiy .env TEGILMAYDI,
#     production himoyasi settings.py da o'z o'rnida qoladi).
#   - Har startda seed_data/seed_platform ChaQIRILMAYDI (faqat idempotent migrate).
#   - Xato bo'lsa TO'XTAYDI va tushunarli sabab beradi.
#   - Health 200 bo'lmaguncha "tayyor" DEYILMAYDI.
# ============================================================================
param(
    [int]$Port = 8000,       # Next dev /api rewrite 127.0.0.1:8000 ga ketadi — mos bo'lsin
    [switch]$WithBot,
    [switch]$SkipMigrate
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venvPy = Join-Path $root '.venv\Scripts\python.exe'

function Die($msg) { Write-Host "`n[XATO] $msg" -ForegroundColor Red; exit 1 }

# 1) .venv va asosiy fayllar bor-yo'qligini qat'iy tekshir ------------------
if (-not (Test-Path $venvPy)) {
    Die ".venv topilmadi: $venvPy`n   Yarating:  python -m venv .venv ; .\.venv\Scripts\pip install -r backend\requirements.txt"
}
if (-not (Test-Path (Join-Path $backend 'manage.py'))) { Die "backend\manage.py topilmadi." }
if (-not (Test-Path (Join-Path $frontend 'package.json'))) { Die "frontend\package.json topilmadi." }
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Die "frontend\node_modules topilmadi. Avval:  cd frontend ; npm install"
}

# 2) LOKAL environment — FAQAT shu skript boshqargan jarayonlarga beriladi ---
#    python-dotenv load_dotenv(override=False) — shu env qiymatlari .env dan
#    USTUN turadi; shu sabab umumiy .env (DEBUG=False, Postgres) o'zgarmaydi.
$env:DEBUG = 'True'                       # lokal SQLite; production guard faqat DEBUG=False da
$env:POSTGRES_DB = ''                     # bo'sh → settings.py SQLite (db.sqlite3) tanlaydi
$env:START_BACKGROUND_SERVICES = 'false'  # lokalda bemor Telethon listener/eslatma loop YOQILMAYDI
Write-Host "Lokal rejim: DEBUG=True, SQLite (db.sqlite3), background services OFF" -ForegroundColor Cyan

# Refuse to silently reuse an unrelated verification server.
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Die "Backend port $Port band. Eski serverni to'xtating; sinov serveri bilan davom etilmaydi."
}
$env:DJANGO_SETTINGS_MODULE = 'core.settings'

# 3) Migratsiya (idempotent; SEED YO'Q) -------------------------------------
if (-not $SkipMigrate) {
    Write-Host "Migratsiya tekshirilmoqda (seed yo'q)..." -ForegroundColor Cyan
    & $venvPy (Join-Path $backend 'manage.py') migrate --noinput
    if ($LASTEXITCODE -ne 0) { Die "Migratsiya muvaffaqiyatsiz. Yuqoridagi sababni o'qing. Server ishga tushirilmadi." }
}

# 4) Backend (runserver) — alohida oynada, .venv python bilan ----------------
Write-Host "Backend ishga tushirilmoqda: http://127.0.0.1:$Port ..." -ForegroundColor Cyan
Start-Process -FilePath $venvPy `
    -ArgumentList @((Join-Path $backend 'manage.py'), 'runserver', "127.0.0.1:$Port", '--settings=core.settings') `
    -WorkingDirectory $backend -WindowStyle Normal

# 5) Frontend (npm run dev) — alohida oynada ---------------------------------
Write-Host "Frontend ishga tushirilmoqda: http://localhost:3000 ..." -ForegroundColor Cyan
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm run dev' `
    -WorkingDirectory $frontend -WindowStyle Normal

# 6) Login bot — ixtiyoriy, BITTA polling jarayoni ---------------------------
if ($WithBot) {
    if ([string]::IsNullOrWhiteSpace($env:TELEGRAM_LOGIN_BOT_TOKEN)) {
        # .env dan o'qib ko'ramiz (settings.py baribir shundan oladi)
        $envFile = Join-Path $root '.env'
        if ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^TELEGRAM_LOGIN_BOT_TOKEN=.+' -Quiet)) {
            Write-Host "Login bot tokeni .env da mavjud — bot ishga tushiriladi." -ForegroundColor Cyan
        } else {
            Write-Host "[OGOH] TELEGRAM_LOGIN_BOT_TOKEN yo'q — login bot ishga tushirilmadi." -ForegroundColor Yellow
            $WithBot = $false
        }
    }
    $lock = Join-Path $backend '.login_bot.lock'
    if ($WithBot -and (Test-Path $lock)) {
        $pidTxt = (Get-Content $lock -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($pidTxt -and (Get-Process -Id $pidTxt -ErrorAction SilentlyContinue)) {
            Write-Host "[OGOH] Login bot allaqachon ishlayapti (PID $pidTxt). Ikkinchi polling boshlanmaydi." -ForegroundColor Yellow
            $WithBot = $false
        } else {
            Remove-Item $lock -ErrorAction SilentlyContinue   # eskirgan lock
        }
    }
    if ($WithBot) {
        Write-Host "Telegram login bot ishga tushirilmoqda (bitta polling)..." -ForegroundColor Cyan
        $p = Start-Process -FilePath $venvPy `
            -ArgumentList @((Join-Path $backend 'manage.py'), 'run_login_bot') `
            -WorkingDirectory $backend -WindowStyle Normal -PassThru
        Set-Content -Path $lock -Value $p.Id -Encoding ascii
    }
}

# 7) Health 200 bo'lmaguncha "tayyor" DEMA -----------------------------------
function Wait-Health($url, $name, $timeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200) { Write-Host "  OK  $name  ($url)" -ForegroundColor Green; return $true }
        } catch { Start-Sleep -Milliseconds 1500 }
    }
    Write-Host "  XATO  $name javob bermadi: $url" -ForegroundColor Red
    return $false
}
Write-Host "`nHealthcheck (200 kutilmoqda)..." -ForegroundColor Cyan
$backOk = Wait-Health "http://127.0.0.1:$Port/api/health/" 'backend'
$frontOk = Wait-Health "http://localhost:3000/api/health/" 'frontend /api proxy'

if ($backOk -and $frontOk) {
    Write-Host "`n=== TAYYOR ===" -ForegroundColor Green
    Write-Host "  CRM:        http://localhost:3000/login"
    Write-Host "  Backend API:http://127.0.0.1:$Port/api/"
    Write-Host "  Django admin(alohida tizim): http://127.0.0.1:$Port/admin/"
} else {
    Write-Host "`n[XATO] Hamma health 200 bo'lmadi — 'tayyor' deyilmaydi. Server oynalaridagi log'ni tekshiring." -ForegroundColor Red
    exit 1
}
