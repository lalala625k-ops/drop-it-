@echo off
setlocal EnableExtensions
title DropIt - First Run Sandbox

set "ROOT=%~dp0.."
set "SOURCE=%ROOT%\release\Drop-it 0.1"
set "SANDBOX=%TEMP%\DropIt-first-run-%RANDOM%-%RANDOM%"
set "APP=%SANDBOX%\DropIt.exe"

if not exist "%SOURCE%\DropIt.exe" (
    echo [ERROR] Portable DropIt was not found:
    echo         %SOURCE%\DropIt.exe
    echo Build or extract release\Drop-it-0.1-Portable.zip first.
    pause
    exit /b 1
)

echo Creating clean first-run sandbox: %SANDBOX%
mkdir "%SANDBOX%\data" >nul 2>nul
mkdir "%SANDBOX%\config" >nul 2>nul
mkdir "%SANDBOX%\Files\Template" >nul 2>nul
copy /y "%SOURCE%\DropIt.exe" "%APP%" >nul || exit /b 1
copy /y "%SOURCE%\pinboard-service.exe" "%SANDBOX%\pinboard-service.exe" >nul || exit /b 1
copy /y "%SOURCE%\Files\Template\*.drop" "%SANDBOX%\Files\Template\" >nul || exit /b 1

set "PINBOARD_DATA_DIR=%SANDBOX%\data"
set "PINBOARD_CONFIG_DIR=%SANDBOX%\config"
set "PINBOARD_LEGACY_DATA_DIR=%SANDBOX%\no-legacy-data"
set "WEBVIEW2_USER_DATA_FOLDER=%SANDBOX%\webview-profile"
set "PINBOARD_DESKTOP=1"

echo This sandbox does not modify your real user data.
start "DropIt First Run Sandbox" "%APP%"
exit /b 0
