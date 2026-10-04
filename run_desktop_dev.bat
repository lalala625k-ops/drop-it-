@echo off
setlocal
echo ========================================================
echo       Infinite Canvas Note - Desktop Live Dev
echo ========================================================
echo.
echo [1/2] Compiling frontend changes...
cd /d "%~dp0frontend"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %errorlevel%
)
echo.
echo [2/2] Launching desktop application window...
cd /d "%~dp0desktop"
call npm start
