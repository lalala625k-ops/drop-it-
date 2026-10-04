@echo off
setlocal
chcp 65001 >nul
title 便签看板 - 桌面版

echo ========================================================
echo       便签看板 (Infinite Canvas Note) - 轻量原生桌面版
echo ========================================================
echo.

set "DESKTOP_DIR=%~dp0"
set "ROOT_DIR=%DESKTOP_DIR%.."

cd /d "%ROOT_DIR%"

if not exist "frontend\dist\index.html" (
    echo [1/2] 正在首次编译前端资源...
    cd frontend
    call npm run build
    cd /d "%ROOT_DIR%"
) else (
    echo [提示] 前端已就绪。如需更新前端修改，请运行 desktop\update.bat
)

echo.
echo [2/2] 启动轻量桌面端 (Edge WebView2 原生引擎)...
python "%DESKTOP_DIR%app.py"

if %errorlevel% neq 0 (
    echo.
    echo [提示] 桌面程序已退出。
)
