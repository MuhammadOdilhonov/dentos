@echo off
chcp 65001 > nul
REM ============================================================
REM  DentOS (32desk) LOKAL ishga tushirish — ishonchli yo'l.
REM  Bu .bat faqat PowerShell launcherni (start-local.ps1) chaqiradi:
REM  bir xil .venv, lokal SQLite, SEED YO'Q, health 200 gacha kutadi,
REM  xatoda to'xtaydi. Umumiy .env (production) TEGILMAYDI.
REM  Bu .bat bosilganda Telegram login bot HAM avtomatik ishga tushadi
REM  (-WithBot doim uzatiladi; .env da TELEGRAM_LOGIN_BOT_TOKEN bo'lsa).
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1" -WithBot %*
