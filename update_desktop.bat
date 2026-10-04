@echo off
setlocal
echo ========================================================
echo       Infinite Canvas Note - Desktop Quick Update
echo ========================================================
echo.
echo [1/2] Compiling frontend changes (Vite)...
cd /d "%~dp0frontend"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %errorlevel%
)
echo.
echo [2/2] Updating unpacked desktop files...
cd /d "%~dp0"
if exist "release-bin\win-unpacked\resources\web" (
    xcopy /y /e /q "frontend\dist\*" "release-bin\win-unpacked\resources\web\" >nul
    echo [SUCCESS] Hot-updated to release-bin\win-unpacked\resources\web!
)
echo.
echo You can now directly run: release-bin\win-unpacked\ËæÏë±ãÇ©.exe
echo.
set /p REBUILD="Rebuild Setup installer? (Y/N, default N): "
if /i "%REBUILD%"=="Y" (
    echo Packaging installer...
    powershell -ExecutionPolicy Bypass -File "%~dp0build_desktop.ps1" -SkipBackend
)
echo Done!
pause
