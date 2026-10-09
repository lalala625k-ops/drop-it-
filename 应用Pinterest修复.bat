@echo off
setlocal EnableExtensions
title Drop-it - Pinterest Drag Update
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\apply_pinterest_update.ps1"
echo.
pause
