@echo off
chcp 65001 >nul
echo ========================================================
echo       随想便签 · 桌面版实时开发与预览运行
echo ========================================================
echo.

cd /d "%~dp0frontend"
echo 正在编译前端最新改动...
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 前端编译失败！
    pause
    exit /b %errorlevel%
)

cd /d "%~dp0desktop"
echo 正在启动桌面窗口...
call npm start
