@echo off
setlocal
title Note Database Backup to Git

echo ===================================================
echo   Backing up notes database to GitHub...
echo ===================================================

cd /d "%~dp0"

echo [0/3] Exporting a consistent SQLite snapshot and media files...
python -m backend.export_snapshot "%~dp0backend\data"
if errorlevel 1 exit /b 1

cd /d "%~dp0backend\data"

if not exist ".git" (
    echo [ERROR] backend/data is not a git repository!
    pause
    exit /b 1
)

echo [1/3] Staging database changes...
git add cards.json assets screenshots

git diff-index --quiet HEAD --
if %errorlevel% equ 0 (
    echo [INFO] No changes detected. Database is up to date locally.
) else (
    echo [INFO] Changes detected, committing...
    git commit -m "Auto backup: %date% %time%"
)

echo [2/3] Pulling remote updates (rebase)...
git pull --rebase origin main

echo [3/3] Pushing to GitHub...
git push origin main

echo ===================================================
echo   Backup finished successfully!
echo ===================================================
ping 127.0.0.1 -n 3 > nul
