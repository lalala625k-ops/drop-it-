# 发布前在本机使用网站

双击根目录的 `open_site.bat`。它会在后台启动本地网站，并打开 `http://localhost:5173/`。关闭浏览器或 Codex 后，网站服务仍会运行；下次需要时再次双击即可。电脑重启后需要再双击一次。

这个入口直接用 FastAPI 提供已经构建好的前端和 `/api` 接口，不需要保持 npm 开发命令窗口打开。服务只监听本机的 `127.0.0.1`，不向局域网或公网开放。使用同一浏览器中的同一地址 `http://localhost:5173/`，可继续使用原有浏览器本地数据；后端仍使用原来的 Windows 本地数据目录。

修改前端代码后，在 `frontend/` 目录执行一次 `npm run build`，再刷新网页即可看到新版本。后端代码改动需要重启服务。启动失败时查看 `%LOCALAPPDATA%\InfiniteCanvasNote\local_site.log`。若 5173 端口被其他程序占用，先关闭原来的 npm/Vite 开发服务，再重新双击。

`run_app.bat` 和 `npm run dev` 仍属于开发入口。日常打开网站使用 `open_site.bat`。
