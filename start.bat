@echo off
chcp 65001 > nul
echo ========================================================
echo   🦷 32Desk Dental Clinic CRM - Tizimni Ishga Tushirish
echo ========================================================
echo.

echo [1/3] Backend bazasini tayyorlash va ma'lumotlarni yuklash...
cd /d "%~dp0backend"
python manage.py migrate --noinput
python manage.py seed_data

echo.
echo [2/3] Django API serverni ishga tushirish (http://127.0.0.1:8000)...
start "32Desk Backend API (Django)" cmd /k "chcp 65001 > nul && python manage.py runserver 127.0.0.1:8000"

echo.
echo [3/3] Next.js Frontend interfeysini ishga tushirish (http://localhost:3000)...
cd /d "%~dp0frontend"
start "32Desk Frontend (Next.js)" cmd /k "npm run dev"

echo.
echo ========================================================
echo   ✓ 32Desk muvaffaqiyatli ishga tushirildi!
echo   Frontend: http://localhost:3000
echo   Backend API: http://127.0.0.1:8000/api/
echo   Admin panel: http://127.0.0.1:8000/admin/
echo ========================================================
timeout /t 3 > nul
start http://localhost:3000
