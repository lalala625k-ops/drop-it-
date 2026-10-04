# 随想便签 · 原生桌面端架构规范与技术手册 (DESKTOP_SPEC)

> **文档定位**：本文专门收录与**桌面端架构**、**桌面端技术栈**、**性能渲染优化**及**专属运行脚本**相关的所有技术设计与实现细节。通用画板业务、Markdown 渲染、图钉与卡片交互规范请参阅 `product_requirements_document.md` 与 `ARCHITECTURE.md`。

---

## 1. 桌面端架构演进与设计理念

在早期探索中，桌面端曾尝试过传统的 Electron 方案，但附带了巨大的包袱：
- **Electron 痛点**：打包体积庞大（>280MB）、空载内存开销高（>350MB）、前后端多进程退出残留僵尸进程、构建与打包繁琐。

经过全面轻量化架构升级后，本项目彻底重构为 **Windows 原生 Edge WebView2 + 单体 FastAPI 嵌入式宿主**：
- **极小体积**：利用 Windows 10/11 内置的 Microsoft Edge WebView2 运行时（Evergreen 引擎），无任何 Chromium 冗余内核，分发仅需核心代码与静态资源。
- **超低内存**：冷启动常驻内存由原 Electron 的 350MB 骤降至 **40MB~60MB**。
- **单进程闭环生命周期**：由 Python 单进程同时守护后台 FastAPI 线程与原生视窗，窗口关闭时所有服务优雅释放，**0 端口冲突、0 僵尸后台残留**。
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
| **视窗桥接层** | **Python + pywebview** | 6.2.1 (WinForms 平台) | 极轻量 Windows 原生窗口控制器；管理窗体创建、尺寸记忆、无控制台静默运行与退出联动。 |
| **嵌入式后端服务** | **FastAPI + Uvicorn** | FastAPI 0.115 / Uvicorn | 本地回环单例服务（127.0.0.1）；提供卡片增删改查、图钉双向同步、OCR 解析、WebP 缩略图服务。 |
| **图片渲染金字塔** | **Pillow** | 12.3.0 (WebP 800px) | 负责图像长边 800px 质量 80% 的 WebP 缩略图流式转换；保留 Alpha 透明通道，支持 EXIF 自动旋正。 |
| **前端开发热更新** | **Vite + React 18 + TS** | Vite 5.4 | 开发态直连 Vite HMR WebSocket；编辑器保存代码在 30 毫秒内于桌面窗口自动热替换。 |
| **生产端构建编译** | **Vite 生产打包** | Rollup 产物 | 仅打包纯 HTML/JS/CSS（约 400KB）；与用户数据完全物理隔离，构建恒定在 **3.08 秒**。 |

---

## 3. 桌面端专属文件目录结构与职责 (`desktop/`)

所有桌面端外壳、启动器和构建脚本已全部集中在 `desktop/` 目录下，根目录仅保留 1 个快速中转入口：

```text
note/
├── 启动桌面版.bat            # 根目录下的一键快捷拉起入口 (纯净 ANSI，转调 desktop\run.bat)
├── desktop/                 # 🌟 桌面端专属工程目录
│   ├── app.py               # 桌面端核心主程序 (Edge WebView2 运行时单体)
│   ├── run.bat              # 日常生产运行脚本 (自动检测首编译，防闪退保护)
│   ├── run_dev.bat          # 实时热更新开发脚本 (直连 Vite HMR，保存代码即生效)
│   ├── update.bat           # 极速增量编译脚本 (3秒编译，窗口内按 F5 刷新即生效)
│   └── README.md            # 桌面端简要指引
├── frontend/                # 前端画布源代码 (通用)
└── backend/                 # 后端数据与算法服务 (通用)
```

### 3.1 核心脚本详细职责

#### 1. `desktop/app.py`
- **自适应根目录解析**：通过 `PROJECT_ROOT = Path(__file__).resolve().parent.parent` 自动定位上层 `frontend` 与 `backend`，支持任何路径移动。
- **智能端口管理**：默认优先使用 `8002` 端口（与 Vite 代理端口保持严格一致）；启动前通过 `/api/health` 检查，若已有后台服务运行则自动复用，杜绝 `[Errno 10048]` 端口占用冲突。
- **多模式自适应分流**：
  - 传入 `--dev` 或探测到 5173 端口活跃时：直连 `http://127.0.0.1:5173`，开启 F12 开发者工具，激活无感 HMR 热更。
  - 默认模式：直连内置 FastAPI 的静态挂载地址 `http://127.0.0.1:8002`，加载本地预编译好的 `frontend/dist` 资源。
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

## 4. PureRef 级高帧率性能重构

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

### 4.3 实时流畅度诊断与性能监视器 (FPS & Performance HUD)
为实时验证 WebView2 硬件加速与空间裁剪的实际调优表现，桌面端在界面提供了双向联动的调试监测系统：
- **左上角实体印刷风实时帧率开关 (`FpsMeter.tsx`)**：
  - 点击左上角 `FPS` 滑块即可开启动态帧率监测（如 `60 FPS`、`144 FPS`）；关闭时彻底解绑 `requestAnimationFrame`，达成 **0 CPU/GPU 额外开销**。
- **右上角核心性能诊断仪表盘 (`PerformanceHUD.tsx`)**：
  - 随帧率开关同步联动，常驻右上角工具栏前侧，展示三大核心流畅度指标：
    1. **单帧耗时 (Frame Time, FT)**：主线程每帧渲染延迟（基准：60Hz 下 ≤16.6ms，144Hz 下 ≤6.9ms），比起均值 FPS 更敏锐捕获瞬时掉帧与主线程毛刺；
    2. **JS 堆内存 (Heap Memory)**：实时读取 WebView2 进程内存占用（如 `52 MB`），监控多图浏览与撤销栈的历史内存走势；
    3. **视口空间裁剪率 (Viewport Culling)**：直观显示 `视口卡片数 / 总卡片数` 及裁剪百分比（如 `33/96卡 (66% 剔除)`），验证空间虚拟化运行健康度。
  - **长任务阻塞侦测与诊断抽屉**：利用 `PerformanceObserver` 监听捕获 >50ms 的长任务阻塞（Long Tasks），点击胶囊展开直角诊断卡片，呈现 DOM 节点数与性能明细。

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
