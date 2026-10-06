# 随想便签 · 本地桌面版与打包指南 (Desktop & Packaging)

> **最新架构说明**：开发模式和发布版统一使用 Windows 原生 Edge WebView2。根目录 `npm run dev` 启动 WebView2 开发壳，发布包通过 PyInstaller 构建，目标用户无需预装 Python 或 Node.js。完整技术栈与架构规范请参阅 **`DESKTOP_SPEC.md`** 与 **`desktop/README.md`**。

---

## 1. 极致流畅度与轻量化架构 (Performance & Smoothness)

为彻底解决无限画布在多卡片、多大图场景下的滚动与缩放卡顿，系统在渲染管线与组件生命周期上做出了核心优化：

1. **缩放/平移零多余渲染（Zero Re-renders on Zoom）**：
   - 彻底移除了 `CardComponent` 的浮点数 `zoom` 属性绑定，改用离散状态 `isTinyThumbnail`。
   - 在正常鼠标滚轮缩放、右键划动或画布拖拽平移时，所有便签卡片保持完全记忆化（`memo` 100% 命中拦截），卡片及其子树正文、图片与 Markdown **零重复计算、零 DOM 重排**，全部变换纯由显卡 GPU 硬件变换矩阵（`transform: translate(x, y) scale(z)`）完成。
2. **滚轮事件帧率对齐（RAF Coalescing）**：
   - 采用 `requestAnimationFrame` 合并高频鼠标滚轮/触控板 delta 增量，滚轮缩放计算严格对齐屏幕刷新率（60Hz/120Hz/144Hz），消除微卡顿与撕裂。
3. **图像异步解码与懒加载**：
   - 所有卡片内图片默认启用 `loading="lazy"` 与 `decoding="async"`，主线程在滚动与移动时绝不被图片主线程解码阻塞。

---

## 2. 大量图片与编译解耦机制 (Image Decoupling)

用户关心的核心问题：**“图片一多之后，重新编译的时候打包会非常缓慢甚至卡死”**。

- **存储完全解耦**：
  - 代码库与构建脚本绝不扫描或打包任何用户的图片资源与 SQLite 运行数据。
  - 用户的全部笔记数据、图片（`assets/`）和截图缓存（`screenshots/`）严格存储在系统的本地应用数据目录中：`%LOCALAPPDATA%\InfiniteCanvasNote\data`（或用户在设置中心自定义的盘符路径）。
- **编译时间恒定**：
  - 前端生产包构建（`npm run build`）耗时恒定为 **~3 秒**。
  - 即使画布中积累了数万张高分辨率图片，重新编译与打包安装包时也**绝不会额外增加一毫秒**，完全不受用户图片数量的影响。

---

---

## 3. 本地桌面应用方案与启动脚本

桌面端已收敛于 `desktop/` 专属目录，并以 Windows 原生 Edge WebView2 为当前核心官方架构：

### Windows 原生 Edge WebView2 (`desktop/`)

利用 Windows 10/11 内置的 Microsoft Edge WebView2 引擎与嵌入式 FastAPI 宿主，实现超低内存占用与即开即用体验：

1. **一键运行入口**：
   - 根目录下直接双击 **`启动桌面版.bat`**（或执行 `desktop\run.bat`）。
   - 自动检测并编译缺失资源，随后无缝拉起原生桌面视窗，冷启动常驻内存仅 **40MB~60MB**。
2. **极速热更新开发 (`desktop/run_dev.bat`)**：
   - 在项目根目录执行 `npm run dev`，或双击 `desktop/run_dev.bat`，统一启动 WebView2 开发壳。
   - 用于边改前端代码边看效果的场景。
   - 自动拉起 Vite HMR 开发服务器（端口 5173）并直连原生窗口，保存代码在 **30ms 内热替换生效**。
   - Vite 与窗口统一使用 `127.0.0.1:5173`，通过 HTTP 检查后才打开窗口；启动失败时提示 `%LOCALAPPDATA%\InfiniteCanvasNote\logs\vite-dev.log` 日志路径。
3. **极速增量编译与原地刷新 (`desktop/update.bat`)**：
   - 修改前端代码后双击 `desktop\update.bat`，3 秒内完成 Rollup 增量构建。
   - 桌面窗口无需重启，直接在窗口内按下 **`F5` 或 `Ctrl+R`** 即可就地刷新生效。
4. **生命周期闭环**：
   - 窗口关闭时清理本次创建的前端与后端服务；已存在并复用的服务继续由原启动器管理。

### Windows 发布包

- **Drop-it 0.1 Windows 发布包**：执行 `build_desktop.ps1` 后生成 `release/Drop-it 0.1/` 免安装目录、`release/Drop-it-0.1-Portable.zip` 和 `release/Drop-it-Setup-0.1.exe`。开发机需要 7-Zip 和 NSIS（可通过 `PINBOARD_MAKENSIS` 指定编译器）。NSIS 安装版安装到当前用户的 `%LOCALAPPDATA%\Drop-it`，创建桌面与开始菜单快捷方式，卸载保留 `Files` 和用户数据。根目录 `打开免安装版.bat` 直接打开最新免安装目录，本机 Windows 快捷方式不提交 Git。发布壳使用系统 Edge WebView2，后端包含 FastAPI 服务和 OCR 运行库；发布内容只包含指定 Template，保存与暂存目录为空。

---

## 4. 极简桌面窗口与调试界面

桌面端使用无边框 WebView，隐藏系统标题栏。右上角保留透明线框的最小化、最大化/还原和关闭按钮；鼠标进入窗口顶部 40px 区域（与标题栏完整高度一致）时，自动显示 40px 高的标题栏，按住左键即可拖动窗口，双击可最大化/还原。鼠标离开后标题栏收起，拖动期间和窗口按钮键盘聚焦期间保持显示。画布左上角不显示 FPS、性能或设置按钮；性能组件保留在代码库中作为后续调试备用，不挂载到当前前端界面。

---

## 5. 跨端图钉持久化与双向同步

- 桌面端与浏览器 Web 端共用后端 SQLite `pins` 表。
- 启动时自动双向比对并同步 1~8 号图钉世界坐标与缩放比例，通过 `Ctrl+1~8` 可在桌面端无缝快速跳转，跨客户端永不丢失。
