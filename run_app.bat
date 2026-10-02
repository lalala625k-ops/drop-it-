@echo off
title Infinite Canvas Note Launcher
echo ===================================================
echo   正在启动 随想便签看板 (Infinite Canvas Note)...
echo ===================================================

echo [1/2] 启动后端服务 (FastAPI)...
start "Note Backend" cmd /k "cd /d %~dp0 && python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload"

echo [2/2] 启动前端开发服务器 (Vite + React)...
start "Note Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 > nul
echo.
echo 正在打开浏览器访问 http://localhost:5173 ...
start http://localhost:5173

echo ===================================================
echo   服务已启动！
echo   前端地址: http://localhost:5173
echo   后端接口: http://127.0.0.1:8000
echo ===================================================
