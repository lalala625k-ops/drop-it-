@echo off
setlocal
title DropIt - Desktop
echo ========================================================
echo       Infinite Canvas Note - Native Desktop App
echo ========================================================
echo.
cd /d "%~dp0.."
if not exist "frontend\dist\index.html" (
    echo [Building frontend...]
    cd frontend
    call npm run build
    cd /d "%~dp0.."
)
python "%~dp0app.py"
if %errorlevel% neq 0 pause
