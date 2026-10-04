@echo off
setlocal
chcp 65001 >nul
title 便签看板 - 快速编译更新

echo ========================================================
echo       便签看板 (Infinite Canvas Note) - 极速热更新
echo ========================================================
echo.
set "DESKTOP_DIR=%~dp0"
set "ROOT_DIR=%DESKTOP_DIR%.."

echo [1/2] 正在编译前端改动 (Vite + TypeScript)...
cd /d "%ROOT_DIR%\frontend"
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 前端编译失败，请检查语法错误！
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] 前端静态资源编译完成！耗时约 3 秒。
cd /d "%ROOT_DIR%"
if exist "release-bin\win-unpacked\resources\web" (
    xcopy /y /e /q "frontend\dist\*" "release-bin\win-unpacked\resources\web\" >nul
    echo [已同步] 已同步至 release-bin 安装包目录。
)

echo.
echo ========================================================
echo [成功] 更新已就绪！
echo 1. 若桌面窗口正在运行，切回窗口按 [F5] 或 [Ctrl+R] 即可立即生效！
echo 2. 若未运行，双击 run.bat 即可启动。
echo ========================================================
pause
