@echo off
setlocal
title Infinite Canvas Note - Update
echo ========================================================
echo       Infinite Canvas Note - Fast Rebuild
echo ========================================================
echo.
cd /d "%~dp0..\frontend"
if exist "dist\.empty-release" del /q "dist\.empty-release"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %errorlevel%
)
echo.
echo ========================================================
echo [SUCCESS] Rebuild complete!
echo If the desktop window is open, press [F5] or [Ctrl+R] to reload.
echo ========================================================
pause
