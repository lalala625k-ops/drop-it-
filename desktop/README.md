# Drop-it 0.1 - Windows 桌面端

本目录收纳了桌面版的所有相关启动文件、更新脚本与运行配置。

开发和发布统一使用 Windows Edge WebView2。在项目根目录执行 `npm run dev`，或双击 `run_dev.bat`，即可启动开发壳；Vite 仅作为壳内热更新服务，由启动器管理。

发布目录包含 `DropIt.exe`、`pinboard-service.exe` 和 `Files/`。`Files/Template` 存放示例，`Files/Save` 是默认手动保存地址，`Files/Temporary` 保存暂存和恢复记录；移动应用时一起保留整个 Files 文件夹。

首次准备环境：执行 `python -m pip install -r backend/requirements-desktop.txt` 和 `npm --prefix frontend install`，并确保系统已安装 WebView2 Runtime。

## 文件结构与用途

截图来源功能见根目录 `FILE_SOURCE_FEASIBILITY.md`。`file_source_api.py` 提供本地来源桥接，`screenshot_sources.py`/`source_win32.py` 被动核验微信 Alt+A 截图，`source_documents.py`/`source_probe_client.py`/`source_worker.py` 读取正在运行的文档，`file_sources.py` 管理短期图像指纹和原文件引用。新增原生模块后须完整重启桌面窗口，前端 HMR 不会更新 Python 观察器。原文档不打包进画板；未命中时可手动关联。

| 文件 | 说明 |
| :--- | :--- |
| **`app.py`** | 桌面端核心主程序。开发时管理 FastAPI 线程与 WebView2 窗口，发布时启动同级的后端 EXE。 |
| **`dev_server.py`** | 直接启动 Node/Vite；主画板监听 `127.0.0.1:5173`，新画板使用独立动态端口与后端代理；检查 `/@vite/client` 就绪后才打开开发窗口，退出时清理自己启动的前端进程。 |
| **`run.bat`** | **日常启动桌面版**。一键拉起轻量桌面应用。 |
| **`run_dev.bat`** | **实时热更新开发环境**。直连 Vite HMR，保存代码（.tsx / .css）后桌面窗口毫秒级自动热更新，无需重启窗口。 |
| **`update.bat`** | **极速编译更新**。修改前端代码后双击，3 秒内编译完成；如果桌面窗口已开着，切回窗口按 `F5` / `Ctrl+R` 即可立即就地生效。 |
| **`../build_desktop.ps1`** | 构建前端、PyInstaller 后端服务、Edge WebView2 启动壳、`release/Drop-it 0.1/`、免安装 ZIP 和 NSIS 桌面安装包。 |
| **`windows_version.txt`** | Windows 文件与产品版本元信息，当前发布版本 0.1。 |
| **`icons/`** | 应用图标资源；Windows 发布启动器使用 `icon.ico`。 |

开发启动会先确认后端和 Vite HTTP 服务就绪。Vite 启动失败时显示具体日志路径，日志位于 `%LOCALAPPDATA%\InfiniteCanvasNote\logs\vite-dev.log`。已有健康的 Vite 服务会复用；关闭窗口只清理本次启动器创建的服务。

## 架构说明
- **与网页版的关系**：桌面端与网页版共享上层的 `frontend/`（前端画板）与 `backend/`（FastAPI 服务与 OCR），桌面端仅作为极轻量的原生视窗宿主。
- **用户数据存储**：所有卡片、笔记、截图与 SQLite 数据库均独立存放于本地系统目录 `%LOCALAPPDATA%\InfiniteCanvasNote\data\`，代码更新与目录调整绝不影响数据安全。
- **窗口外观**：桌面端平时保持无框，右上角窗口按钮常驻；鼠标进入顶部 40px 区域（与标题栏完整高度一致）时显示可拖动的 40px 标题栏，双击可最大化/还原，离开后收起，拖动及窗口按钮键盘聚焦时保持显示。画布左上角不显示性能或设置按钮，设置从右键菜单进入。
- **发布方式**：Windows 安装包包含前端、FastAPI/PyInstaller 服务、OCR 运行库和轻量 Edge WebView2 启动壳；用户不需要预装 Python 或 Node.js。Windows 10/11 通常已自带 WebView2 Runtime，缺少时按启动提示安装微软官方运行时即可。
- **用户数据**：安装目录包含程序和 `Files`（示例、手动保存与暂存）；运行数据库和图片写入 `%LOCALAPPDATA%\InfiniteCanvasNote\data`，卸载保留两处用户数据。

- **默认示例**：发布包在 EXE 同级提供 `Files/Template/Template一.drop`，该文件夹只包含这一份示例。首次启动直接恢复它的卡片、分组、视口与图钉；首次“打开”默认定位该目录，之后记忆个人文件。开发源文件为 `desktop/Template/Template一.drop`，移动免安装版时保留整个文件夹。

开发模式新画板也同步热更新：每个窗口的 Vite 通过 `PINBOARD_VITE_BACKEND_URL` 代理到自身后端，数据目录相互独立。新画板日志为 `vite-dev-<端口>.log`。此前已打开的静态新画板在更新构建后按 F5 读取最新界面；后续新建的开发画板会直接使用热更新。

构建需要 7-Zip 和 NSIS。安装版使用当前用户权限，默认目录 `%LOCALAPPDATA%\Drop-it`，提供桌面、开始菜单快捷方式及卸载入口。免安装版解压后即可运行，两种版本均需系统 WebView2 Runtime。安装包与 ZIP 通过 GitHub Releases 发布，不提交 Git。
