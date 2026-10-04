@echo off
chcp 65001 >nul
echo ========================================================
echo       随想便签 · 桌面版快速更新脚本 (3秒增量热更新)
echo ========================================================
echo.

echo [1/2] 正在编译前端最新改动...
cd /d "%~dp0frontend"
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 前端编译失败，请检查代码！
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] 正在同步到桌面版便携目录...
cd /d "%~dp0"
if exist "release-bin\win-unpacked\resources\web" (
    xcopy /y /e /q "frontend\dist\*" "release-bin\win-unpacked\resources\web\" >nul
    echo [成功] 已将最新界面热更新到 release-bin\win-unpacked 便携版！
)

echo.
echo --------------------------------------------------------
echo 提示：
echo 1. 你现在可以直接打开 release-bin\win-unpacked\随想便签.exe 查看最新界面！
echo 2. 如果需要重新生成完整 Setup 安装包，输入 Y 回车，否则直接按任意键退出。
echo --------------------------------------------------------
set /p REBUILD_INSTALLER="是否重新打包 Setup 安装程序？(Y/N, 默认 N): "
if /i "%REBUILD_INSTALLER%"=="Y" (
    echo.
    echo 正在重新打包安装包...
    powershell -ExecutionPolicy Bypass -File "%~dp0build_desktop.ps1" -SkipBackend
)

echo.
echo 更新完成！
pause
