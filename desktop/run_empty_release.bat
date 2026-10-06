@echo off
setlocal
title Infinite Canvas Note - Empty Release
cd /d "%~dp0.."
set "PINBOARD_RELEASE_EMPTY=1"
set "PINBOARD_DESKTOP=1"
python "%~dp0app.py"
if %errorlevel% neq 0 pause
