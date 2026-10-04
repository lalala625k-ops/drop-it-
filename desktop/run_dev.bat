@echo off
setlocal
title Infinite Canvas Note - Live Dev
echo ========================================================
echo       Infinite Canvas Note - Live Dev (Vite HMR)
echo ========================================================
echo.
cd /d "%~dp0.."
python "%~dp0app.py" --dev
if %errorlevel% neq 0 pause
