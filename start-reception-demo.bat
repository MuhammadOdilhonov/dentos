@echo off
setlocal
chcp 65001 >nul
set "PYTHONUTF8=1"
cd /d "%~dp0backend"
set "START_BACKGROUND_SERVICES=false"
set "RECEPTION_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
set "RECEPTION_PACKAGES=C:\Users\user\Documents\Codex\2026-10-19\hu\work\python-packages"
if exist "%RECEPTION_PYTHON%" if exist "%RECEPTION_PACKAGES%\django" goto bundled
python manage.py reception_demo --settings=core.test_settings
goto finished
:bundled
set "PYTHONPATH=%RECEPTION_PACKAGES%"
"%RECEPTION_PYTHON%" manage.py reception_demo --settings=core.test_settings
:finished
pause

