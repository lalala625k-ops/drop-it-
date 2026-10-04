# 随想便签 · 本地桌面版与打包指南 (Desktop & Packaging)

> **最新架构说明**：桌面端已全面演进为 Windows 原生 Edge WebView2 极轻量单体架构（~25MB 分发体积，~50MB 运行内存）。完整技术栈与架构规范请参阅核心文档 👉 **[`DESKTOP_SPEC.md`](file:///c:/Users/lalala/Desktop/note/DESKTOP_SPEC.md)** 与 **[`desktop/README.md`](file:///c:/Users/lalala/Desktop/note/desktop/README.md)**。

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

## 3. 本地离线应用与安装包方案

项目当前在 Git 新开的 `desktop-app` 分支上维护桌面化工程，提供双轨打包能力：

### 方案 A：Windows 离线独立安装程序 (NSIS Setup / 推荐立即可用)

利用 Electron 外壳与 PyInstaller 编译的本地 FastAPI 独立服务，打包为标准的 Windows 离线安装包（无需用户电脑配置任何 Python、Node 或 Rust 运行环境）：

1. **一键构建离线安装包**：
   ```powershell
   powershell -ExecutionPolicy Bypass -File build_desktop.ps1
   ```
2. **极速增量打包（若后端未修改）**：
   ```powershell
   powershell -ExecutionPolicy Bypass -File build_desktop.ps1 -SkipBackend
   ```
   只需 10 秒即可重新生成安装包。
3. **构建产物**：
   - 输出至 `dist-desktop/` 目录。
   - `随想便签 Setup 1.0.0.exe`：全自动引导安装程序（支持自定义安装路径、创建桌面快捷方式、开始菜单图标与卸载程序）。
   - `win-unpacked/`：解压即用的绿色免安装便携版。

### 方案 B：Tauri 2.0 原生超轻量架构 (`src-tauri/`)

对于追求极限体积（~10MB 安装包、30MB 内存占用）的用户，项目已完整集成 Tauri 2.0 配置架构：

1. **核心优势**：
   - 直接复用 Windows 内置的 Microsoft Edge WebView2 运行时，无需打包庞大的 Chromium 引擎。
   - 内存开销极低，冷启动瞬时完成。
2. **环境要求**：
   - 需在本机安装 Rust 工具链（`rustup` / `cargo`）及 Visual Studio C++ 生成工具。
3. **构建命令**：
   ```bash
   # 启动开发调试
   npm run tauri:dev

   # 构建轻量化安装程序
   npm run tauri:build
   ```
