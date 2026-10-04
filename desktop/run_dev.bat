@echo off
setlocal
chcp 65001 >nul
title 便签看板 - 实时热更新开发桌面版

echo ========================================================
echo       便签看板 (Infinite Canvas Note) - 实时热更新桌面环境
echo ========================================================
echo.
echo [提示] 正在启动 Vite HMR + 原生 Edge WebView2 窗口...
echo [提示] 启动后在代码编辑器中修改任何代码，窗口将实时自动更新！
echo.

set "DESKTOP_DIR=%~dp0"
set "ROOT_DIR=%DESKTOP_DIR%.."

cd /d "%ROOT_DIR%"
python "%DESKTOP_DIR%app.py" --dev

if %errorlevel% neq 0 (
    echo.
    echo [提示] 桌面程序已退出。
)
