# Backend-only lokal ishga tushirish (SQLite db.sqlite3, loyiha .venv).
# To'liq stek uchun loyiha ildizidagi  start-local.ps1  ni ishlating.
# Ishlatish:  .\dev.ps1   yoki   .\dev.ps1 8001
param([string]$Port = "8000")
$ErrorActionPreference = 'Stop'
$backend = $PSScriptRoot
$venvPy = Join-Path $backend '..\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) {
    Write-Host "[XATO] .venv topilmadi: $venvPy" -ForegroundColor Red
    Write-Host "       Yarating:  python -m venv .venv ; .\.venv\Scripts\pip install -r backend\requirements.txt"
    exit 1
}
# Lokal env — FAQAT shu jarayonga. Umumiy .env (DEBUG=False, Postgres) tegilmaydi;
# load_dotenv(override=False) shu qiymatlarni .env dan ustun qo'yadi.
$env:DEBUG = "True"                       # lokal SQLite; production guard faqat DEBUG=False da
$env:POSTGRES_DB = ""                     # bo'sh → SQLite tanlanadi
$env:START_BACKGROUND_SERVICES = "false"  # bemor Telethon listener/eslatma loop lokalda yoqilmaydi
& $venvPy (Join-Path $backend 'manage.py') runserver "127.0.0.1:$Port"
