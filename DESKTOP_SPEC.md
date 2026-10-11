# 随想便签 · 原生桌面端架构规范与技术手册 (DESKTOP_SPEC)

> **文档定位**：本文专门收录与**桌面端架构**、**桌面端技术栈**、**性能渲染优化**及**专属运行脚本**相关的所有技术设计与实现细节。通用画板业务、Markdown 渲染、图钉与卡片交互规范请参阅 `product_requirements_document.md` 与 `ARCHITECTURE.md`。

---

## 1. 桌面端架构演进与设计理念

### 截图原文件来源（2026-10-11，实验性）

`WindowApi` 混入 `FileSourceApi`，窗口创建时启动被动观察器，关闭时清空记录并停止子进程。低级钩子不拦截输入，观察微信默认 `Alt+A`，并确认微信 `SnapshotWnd`/`CToolBarWnd` 的进程归属。截图前保存来源窗口、虚拟屏幕原点及像素；完成时只读 CF_DIB，不重写剪贴板。

完整来源通过已运行的软件接口读取，不从窗口标题拼路径。Photoshop 使用 `ActiveDocument.FullName`；WPS PDF 使用 `KPDF.Application`，多个可见阅读器窗口时拒绝匹配；WPS 演示通过文档子窗口的原生对象读取 Presentation.FullName。COM 在可停止的隐藏子进程中执行，避免繁忙软件挂住桌面主线程；各适配器独立，PDF/PPT 不依赖 Photoshop 运行。

必须核验框选完全落在来源窗口、无其他窗口遮挡、图片与原屏幕选区像素一致、剪贴板序号未变及记录未超过 5 分钟。QQ、其他快捷键、标注、多窗口框选、其他阅读器未认证，核验失败保留图片，用户可通过原生文件选择器手动关联。

只读路径引用经过现有工作区存储，点击时重新检查文件存在并由 `os.startfile` 打开。原文档不复制、不保存修改，不进入 `.drop`。更新原生代码后须重启桌面窗口，旧安装包需重新构建方可包含此功能。

开发和发布桌面端均使用 **Windows 原生 Edge WebView2 + FastAPI 本地服务**。开发态便于快速迭代和 HMR 调试，发布态使用 PyInstaller 固化 Python 服务与轻量 pywebview 启动壳：
- **开发入口统一**：项目根目录 `npm run dev` 转调 `desktop/run_dev.bat`，由 `desktop/app.py` 管理 FastAPI 线程、Vite HMR 和 WebView2 窗口。Vite 只负责热更新与 API 代理，不自行启动后端。
- **发布态自包含**：PyInstaller 将 FastAPI、OCR、Pillow 和模型运行库打进后端服务，启动壳与后端一起放入安装包；不依赖 Python 或 Node.js。
- **独立数据目录**：程序文件和 `%LOCALAPPDATA%\InfiniteCanvasNote\data` 分离，升级和卸载不会删除画布数据。
- **业务与视窗彻底解耦**：前端（`frontend/`）与后端（`backend/`）保持纯粹的跨平台 Web/API 能力，桌面端专属逻辑全部收敛在 `desktop/` 目录下。

```mermaid
flowchart TD
    subgraph DesktopHost["desktop/app.py (轻量单体宿主)"]
        Launcher["主进程入口"] --> PortCheck{"检测并分配端口 (默认 8002)"}
        PortCheck -->|服务未运行| FastAPISvr["后台线程拉起本地 FastAPI"]
        PortCheck -->|服务已存在| ReuseSvr["复用已有本地服务"]
        Launcher --> ModeCheck{"启动模式判断"}
        ModeCheck -->|--dev (热更开发)| ViteHMR["拉起/直连 Vite (127.0.0.1:5173)"]
        ModeCheck -->|生产运行| DistWeb["加载本地前端构建 (127.0.0.1:8002)"]
        ViteHMR --> WebView2["唤起 Windows 原生 Edge WebView2 窗口"]
        DistWeb --> WebView2
    end

    subgraph DataStorage["本地独立存储 (%LOCALAPPDATA%/InfiniteCanvasNote/data/)"]
        FastAPISvr --> DB[("board.sqlite3 (WAL 模式)")]
        FastAPISvr --> ImgDir["images/ (原始高清大图)"]
        FastAPISvr --> ThumbDir["thumbnails/ (800px WebP 金字塔)"]
    end
```

---

## 2. 核心技术栈 (Desktop Tech Stack)

| 层次 | 技术选型 | 版本/规范 | 选型优势与核心职责 |
| :--- | :--- | :--- | :--- |
| **原生视窗引擎** | **Microsoft Edge WebView2** | Evergreen (系统预置) | Windows 原生嵌入式浏览器控件，共享系统内核更新，0MB 引擎体积，硬件加速支持良好。 |
| **发布视窗引擎** | **系统 Edge WebView2** | 由 pywebview 调用 | 不封装 Chromium；Windows 10/11 通常已提供 WebView2 Runtime。 |
| **视窗桥接层** | **Python + pywebview** | 6.2.1 (WinForms 平台) | 极轻量 Windows 原生窗口控制器；管理窗体创建、尺寸记忆、无控制台静默运行与退出联动。 |
| **嵌入式后端服务** | **FastAPI + Uvicorn** | FastAPI 0.115 / Uvicorn | 本地回环单例服务（127.0.0.1）；提供卡片增删改查、图钉双向同步、OCR 解析、WebP 缩略图服务。 |
| **图片渲染金字塔** | **Pillow** | 12.3.0 (WebP 800px) | 负责图像长边 800px 质量 80% 的 WebP 缩略图流式转换；保留 Alpha 透明通道，支持 EXIF 自动旋正。 |
| **前端开发热更新** | **Vite + React 18 + TS** | Vite 5.4 | 开发态直连 Vite HMR WebSocket；编辑器保存代码在 30 毫秒内于桌面窗口自动热替换。 |
| **生产端构建编译** | **Vite 生产打包** | Rollup 产物 | 仅打包纯 HTML/JS/CSS（约 400KB）；与用户数据完全物理隔离，构建恒定在 **3.08 秒**。 |

---

## 3. 桌面端专属文件目录结构与职责 (`desktop/`)

桌面端外壳和启动器集中在 `desktop/`，根目录提供源码启动和发布目录入口：

```text
note/
├── 启动桌面版.bat            # 根目录下的一键快捷拉起入口 (纯净 ANSI，转调 desktop\run.bat)
├── 打开免安装版.bat          # 相对路径打开 release/Drop-it 0.1；本机另有不提交 Git 的 .lnk
├── desktop/                 # 🌟 桌面端专属工程目录
│   ├── app.py               # 桌面端核心主程序 (Edge WebView2 运行时单体)
│   ├── run.bat              # 日常生产运行脚本 (自动检测首编译，防闪退保护)
│   ├── run_dev.bat          # 实时热更新开发脚本 (直连 Vite HMR，保存代码即生效)
│   ├── update.bat           # 极速增量编译脚本 (3秒编译，窗口内按 F5 刷新即生效)
│   ├── dev_server.py        # Vite 就绪检查与所属进程管理
│   ├── close_checkpoint.py  # 关闭前确认暂存，清理所属服务进程树
│   ├── icons/               # 应用图标；发布启动器使用 icon.ico
│   └── README.md            # 桌面端简要指引
├── frontend/                # 前端画布源代码 (通用)
└── backend/                 # 后端数据与算法服务 (通用)
```

### 3.2 Windows 发布构建

在已安装 Node.js、Python、PyInstaller、7-Zip 和 NSIS 的开发机上执行根目录 `build_desktop.ps1`。脚本依次构建前端、生成 `backend/dist/pinboard-service.exe` 和 `desktop/dist/DropIt.exe`，再组装 `release/Drop-it 0.1/`、`release/Drop-it-0.1-Portable.zip` 和 `release/Drop-it-Setup-0.1.exe`。NSIS 可通过 `PINBOARD_MAKENSIS` 指定编译器，临时压缩目录遵循系统 TEMP/TMP 设置。发布包包含应用 Logo、OCR 运行库和图片服务；目标用户无需安装 Python 或 Node.js。

安装版以当前用户权限安装到 `%LOCALAPPDATA%\Drop-it`，创建桌面与开始菜单快捷方式、注册卸载入口；卸载仅清理程序，保留 `Files` 与运行数据。打包器校验文件白名单，只允许两份 EXE、使用说明和指定 Template，若发现个人保存、恢复记录或额外文件则停止，支持 `--installer-only` 单独重新编译已验证的安装包。源码通过 Git 提交，发布程序通过 GitHub Releases 分发。

开发依赖通过 `python -m pip install -r backend/requirements-desktop.txt` 和 `npm --prefix frontend install` 安装。WebView2 Runtime 使用微软官方系统运行时；应用图标位于 `desktop/icons/`，构建启动器时明确指定 `desktop/icons/icon.ico`。

示例文件独立放在 EXE 同级的 `Files/Template/Template一.drop`，该目录只包含这一份文件，打包时仅复制 `desktop/Template/Template一.drop`，不再把旧模板嵌入后端 EXE。首次启动直接恢复示例的卡片、分组、视口与图钉；首次使用“打开”默认进入 `Files/Template` 目录，之后记忆个人工作区路径。移动免安装版时保留整个文件夹，模板路径随 EXE 位置变化。修改示例后首次保存仍要求选择个人文件。

### 3.3 核心脚本详细职责

#### 1. `desktop/app.py`
- **自适应根目录解析**：通过 `PROJECT_ROOT = Path(__file__).resolve().parent.parent` 自动定位上层 `frontend` 与 `backend`，支持任何路径移动。
- **智能端口管理**：默认优先使用 `8002` 端口（与 Vite 代理端口保持严格一致）；启动前通过 `/api/health` 检查，若已有后台服务运行则自动复用，杜绝 `[Errno 10048]` 端口占用冲突。
- **多模式自适应分流**：
  - 传入 `--dev` 或探测到 `127.0.0.1:5173/@vite/client` 已就绪时：直连 `http://127.0.0.1:5173`，开启 F12 开发者工具，激活无感 HMR 热更。Vite 明确绑定 IPv4，直接通过 Node 启动；后端和前端 HTTP 就绪后才打开窗口，启动失败显示日志路径，避免跳转到拒绝连接页。
  - 默认模式：直连内置 FastAPI 的静态挂载地址 `http://127.0.0.1:8002`，加载本地预编译好的 `frontend/dist` 资源。
- **极简无边框窗口**：桌面 URL 带 `desktop=1` 标记，隐藏系统标题栏与左上角工具栏；前端在右上角保留透明线框窗口按钮，鼠标进入顶部 40px 区域（与标题栏完整高度一致）时自动显示 40px 高的标题栏。桌面壳通过 `desktop/window_chrome.py` 给无边框 WebView 恢复 `WS_THICKFRAME` 等 Windows 窗口样式，并实现四边/四角原生命中测试；标题栏拖动调用 `WM_NCLBUTTONDOWN/HTCAPTION`，因此 Windows 自带的 Snap 半屏、贴边最大化、多显示器与 DPI 处理继续生效。最小窗口尺寸为 480×320。离开后收起，拖动及窗口按钮键盘聚焦时保持显示。
- **控制台安全配置**：重构 `sys.stdout` 与 `sys.stderr` 编码为 UTF-8，彻底解决 Windows 控制台因特殊字符抛出 `UnicodeEncodeError` 的问题。

#### 2. `desktop/run_dev.bat`
- 专门用于**边改代码边看效果**的开发场景。
- 采用纯净 7-bit ASCII 与 Windows CRLF 换行规范，杜绝 UTF-8 BOM 导致的 CMD 语法解析崩溃。
- 一键拉起热更新开发环境，末尾包含 `if %errorlevel% neq 0 pause` 错误保护。

#### 3. `desktop/run.bat`
- 专门用于**日常离线独立使用**。
- 启动前自动检查 `frontend/dist/index.html` 是否存在；若初次使用未编译，会自动调用 `npm run build` 预热后再拉起桌面窗口。

#### 4. `desktop/update.bat`
- 当修改了前端代码且希望更新生产模式时使用。
- 3 秒内执行完 Vite 构建；若桌面窗口处于打开状态，**切回桌面窗口直接按 `F5` 或 `Ctrl+R` 即可原地刷新生效**，无需重新双击 bat。

---

## 4. 高帧率性能重构

为了让画布在包含几十甚至数百张 4K/8K 图片时依旧保持 60/120/144 FPS 丝滑缩放，桌面端落地了两项核心渲染优化：

### 4.1 双轨图像金字塔 (LOD WebP Pipeline)
- **显存危机排查**：一张 4K PNG 图像（3840×2160）在被浏览器解码到显卡显存时，需要占用：
  $$3840 \times 2160 \times 4 \text{ 字节} \approx 33.17 \text{ MB 显存}$$
  若画布上有 30 张高清大图，显存占用即突破 **1 GB**，在滚轮缩放与平移时造成显存带宽严重拥堵，引发持续性掉帧。
- **LOD 优化方案**：
  1. 新增 `backend/services/thumbnail_service.py`：上传/粘贴图片时，后台毫秒级异步生成一张长边不超过 800px、质量 80% 的 WebP 缩略图（单图仅 20KB~50KB，显存解码仅 ~1.4MB，**显存压力下降 95.7%**）。
  2. 新增 `GET /api/thumbnails/{category}/{filename}` 动态与缓存提供接口，并在后端启动时对现存的全部媒体执行静默后台批处理预热。
  3. 前端 `CardBodyContent.tsx` 与 `CardComponent.tsx` 实现双轨自适应加载：远景与常规浏览状态优先渲染 WebP 缩略图；卡片被双击、触发放大或执行 OCR 时消费原图，且具备自动容错回退机制（缩略图失败无缝降级加载原图）。

### 4.2 空间视口严格虚拟化 (Spatial Culling)
- **彻底移除 `<= 40` 限制**：旧代码中存在当卡片数小于等于 40 时完全跳过视口裁剪的硬编码，导致即使用户只有 20 张高清图，视口外的卡片 DOM 和解码纹理依然全额常驻。
- **动态卸载离屏节点**：在 `useVirtualViewport.ts` 中根据当前世界坐标视口边界加 350px 屏幕安全缓冲，离开视野的所有卡片 DOM 彻底从 React 树中卸载，WebView2 / Chromium 引擎立即释放解码显存。
- **图钉与选中持久保护**：所有正被选中的卡片、正在拖动的卡片以及图钉引导对象始终强制保留，绝不在用户交互过程中闪烁或消失。

### 4.3 当前桌面界面

桌面端当前不挂载 FPS、性能 HUD 或识别调试面板，避免占用画布空间。无边框窗口通过 `desktop=1` 标记启用，右上角窗口按钮常驻；鼠标移到顶部时显示可拖动、可双击最大化/还原的标题栏，离开后自动收起，拖动及键盘聚焦窗口按钮时保持显示。标题栏覆盖画布，不改变保存的视口与卡片位置。

---

## 5. 跨端图钉 (Pins) 双向持久化同步机制

### 5.1 历史隔离问题剖析
- 过去卡片与分组保存在 SQLite，但“图钉”仅保存在前端 `localStorage['pinboard_canvas_pins_v1']`。
- 由于浏览器遵循同源策略（Same-Origin Policy），外部日常浏览器（如 Chrome/Edge）、桌面端 WebView2 实例、以及不同端口之间，`localStorage` **物理完全隔离**。
- 这导致用户在网页版设置好的图钉初次打开桌面版时不会显示，但桌面版新建图钉能正常生效。

### 5.2 全自动双向同步机制
- **后端数据库升级**：在 SQLite 的 `meta` 表中建立 `key='pins'` 的持久化存储，开放 `GET/POST /api/cards/pins` 接口。
- **前端自动拉取与回血**：
  - 启动时同时读取本地 `localStorage` 与后端 SQLite。
  - **自动同步老数据**：若检测到本地有旧图钉而服务端为空（例如在原浏览器打开网页版），前端在 0.1 秒内自动将本地图钉批量同步推入后端数据库。
  - **自动加载新环境**：新环境（如桌面端首次打开）检测到服务端存在图钉而本地为空时，自动将后端图钉拉取并持久化至本地。
  - 任何新建、拖动平移、删除图钉操作，自动实时写入 SQLite 数据库。

---

## 6. 用户资产与编译打包绝对解耦

用户最关注的体验之一是：“**随着使用时间增加，笔记和图片变多之后，重新编译打包会不会变得卡顿或异常缓慢？**”

本桌面架构从物理层面保证了构建速度的绝对恒定：
1. **资产物理隔离**：
   - 所有的用户图片、截图、缩略图与 SQLite 数据库严格存放于 `%LOCALAPPDATA%\InfiniteCanvasNote\data\`（或用户设置的自定义盘符）。
   - 该目录位于代码仓库与构建工作区外部，**绝对不参与任何 Webpack / Vite 模块分析或 Rollup 打包流程**。
2. **构建耗时恒定**：
   - 前端执行 `npm run build`（或双击 `desktop/update.bat`）仅分析纯 TypeScript 代码与 SVG/CSS 样式，产物体积仅约 400KB。
   - **无论画布中积累了 10 张图、还是 10,000 张 4K 大图，前端构建耗时永远稳定在 3 秒左右**。

---

## 7. 脚本编码规范与排障速查 (Troubleshooting)

在 Windows 环境下维护桌面端脚本时，必须严格遵守以下底层规范：

### 7.1 Batch 脚本编码铁律
- **严禁带有 UTF-8 BOM（`\xef\xbb\xbf`）**：中文 Windows 的 `cmd.exe` 启动时默认采用代码页 936（GBK），若批处理文件头部带有 UTF-8 BOM，CMD 会将 BOM 当作非法指令执行，并在解析中文字符时发生严重断句错乱，导致窗口一闪而过、闪退关闭。
- **所有 `.bat` 文件必须采用纯净 7-bit ASCII 或标准 GBK (ANSI) 编码，换行符严格采用 Windows CRLF (`\r\n`)**。
- **重要脚本末尾必须追加 `pause` 或 `if %errorlevel% neq 0 pause`**，确保任何运行异常都能驻留打印控制台堆栈，杜绝黑屏闪退。

### 7.2 常见问题速查

| 现象 | 可能原因 | 解决方案 |
| :--- | :--- | :--- |
| **双击脚本无反应或瞬间关闭** | 批处理文件带有 BOM 头或换行符为 LF | 检查文件编码，改用标准 ANSI/CRLF 保存；在 CMD 中运行该脚本查看报错。 |
| **桌面版看不到网页版的旧图钉** | 旧图钉仍停留在外部浏览器的 localStorage 中 | 用你之前常用的浏览器打开一次网页版刷新一下，图钉会自动回写到数据库；切回桌面版按 `F5` 即可全部同步。 |
| **桌面窗口中修改代码后未生效** | 生产模式加载的是旧的 `dist` | 双击 `desktop/update.bat` 重新编译（3 秒），切回桌面窗口按 `F5` 或 `Ctrl+R`；或者直接使用 `desktop/run_dev.bat` 开发模式。 |
| **桌面端报告端口被占用** | 之前有残留的非正常退出进程 | `desktop/app.py` 已内置端口自愈与复用逻辑；若依然冲突，可在任务管理器中结束残留的 `python.exe` 进程。 |

## 工作区暂存

发布版默认在 EXE 同级的 Files 中创建 Template、Save、Temporary 三个文件夹，后台仅写恢复记录，正式 .drop 由手动保存更新。启动续接完整画板；正常关闭先异步确认暂存成功，失败保留窗口。浏览器退出为尽力刷新，强制终止恢复最近成功写入的版本。发布包仅包含指定的 Files/Template 示例及空 Save、Temporary 文件夹；用户保存和暂存内容不纳入构建输入或发布归档。
