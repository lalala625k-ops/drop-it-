# Windows 桌面版

## 构建与运行

在 Windows 上安装 `backend/requirements-desktop.txt` 与 `desktop/package.json` 中的依赖，然后从仓库根目录运行 `powershell -ExecutionPolicy Bypass -File build_desktop.ps1`。安装包输出到 `release/`。开发时先运行 `npm run build`（位于 `frontend/`），再在 `desktop/` 运行 `npm start`。

桌面版启动本机 FastAPI 服务并打开 `http://127.0.0.1:8000/`；同一电脑的浏览器可打开此地址使用同一份数据。运行数据位于 `%LOCALAPPDATA%\InfiniteCanvasNote\data`。首次启动会将旧 `backend/data/cards.json`、`assets/` 和 `screenshots/` 复制到该目录，并保留 `migration-backup/`。

首次启动还会在原浏览器打开 `http://localhost:5173/` 的迁移页。请使用原来保存便签的浏览器配置，点击“迁移到桌面版”，以带走尚未同步的便签、IndexedDB 图片和视口。迁移页完成后返回桌面应用。若原网页曾使用 `127.0.0.1:5173` 等不同地址，需用原地址打开带相同 `migrate` 参数的页面；浏览器存储按地址隔离。

数据提交使用修订号。两个窗口先后编辑时，切回窗口会读取新数据；发生过期写入时保留本地待同步副本并提示，不静默覆盖。此版本不提供自动合并冲突，遇到提示请先使用 JSON 备份保留本地修改，再处理远程版本。

`backup_database.bat` 现在从 SQLite 导出一致的 `cards.json` 和资源文件，再推送独立数据仓库。迁移失败时，旧 `backend/data` 以及新目录中的 `migration-backup/`、`browser-migration-backup/` 均保留。安装包未签名，Windows 可能显示发布者未知。
