@echo off
setlocal
title Infinite Canvas Note - Empty Release Build
cd /d "%~dp0"
echo ========================================================
echo       Building empty release version
echo ========================================================
echo.
set "VITE_RELEASE_EMPTY=1"
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Empty release build failed.
    pause
    exit /b %errorlevel%
)
cd /d "%~dp0"
>"frontend\dist\.empty-release" echo empty
echo.
echo [SUCCESS] Empty release frontend built.
echo Runtime data is not deleted. Use desktop\run_empty_release.bat to test it.
pause
