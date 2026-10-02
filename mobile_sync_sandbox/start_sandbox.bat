@echo off
chcp 65001 >nul
title 随想便签 - 手机同步隔离测试沙箱

echo =======================================================
echo   🎨 随想便签 · 手机同步隔离测试环境
echo =======================================================
echo.
echo [1/2] 正在启动独立后端服务 (Port: 8088)...
start "Note Mobile Sync Server" cmd /k "python mobile_sync_sandbox/server.py"

echo [2/2] 等待服务初始化并自动在浏览器打开测试看板...
timeout /t 2 /nobreak >nul
start http://localhost:8088/

echo.
echo =======================================================
echo   ✅ 服务已启动！
echo   🖥️ 电脑看板地址: http://localhost:8088/
echo   📂 接收文件夹: mobile_sync_sandbox\inbox_data\
echo =======================================================
pause
