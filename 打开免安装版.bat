@echo off
setlocal
set "PORTABLE=%~dp0release\Drop-it 0.1"
if not exist "%PORTABLE%\DropIt.exe" (
    echo Build the portable edition first: npm run desktop:dist
    pause
    exit /b 1
)
start "" explorer.exe "%PORTABLE%"
