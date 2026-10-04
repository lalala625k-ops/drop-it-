@echo off
setlocal
chcp 65001 >nul
title 便签看板 - 快速编译更新

echo ========================================================
echo       便签看板 (Infinite Canvas Note) - 极速热更新
echo ========================================================
echo.
echo [1/2] 正在编译前端改动 (Vite + TypeScript)...
cd /d "%~dp0frontend"
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 前端编译失败，请检查语法错误！
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] 前端静态资源编译完成！耗时约 3 秒。
cd /d "%~dp0"
if exist "release-bin\win-unpacked\resources\web" (
    xcopy /y /e /q "frontend\dist\*" "release-bin\win-unpacked\resources\web\" >nul
    echo [已同步] 已同步至 release-bin 安装包目录。
)

echo.
echo ========================================================
echo [成功] 更新已就绪！双击 run_desktop.bat 即可查看最新改动。
echo ========================================================
pause
