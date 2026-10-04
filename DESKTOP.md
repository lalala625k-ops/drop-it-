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

---

## 3. 本地桌面应用方案与启动脚本

桌面端已收敛于 `desktop/` 专属目录，并以 Windows 原生 Edge WebView2 为当前核心官方架构：

### 官方推荐：Windows 原生 Edge WebView2 极轻量单体架构 (`desktop/`)

利用 Windows 10/11 内置的 Microsoft Edge WebView2 引擎与嵌入式 FastAPI 宿主，实现超低内存占用与即开即用体验：

1. **一键运行入口**：
   - 根目录下直接双击 **`启动桌面版.bat`**（或执行 `desktop\run.bat`）。
   - 自动检测并编译缺失资源，随后无缝拉起原生桌面视窗，冷启动常驻内存仅 **40MB~60MB**。
2. **极速热更新开发 (`desktop/run_dev.bat`)**：
   - 用于边改前端代码边看效果的场景。
   - 自动拉起 Vite HMR 开发服务器（端口 5173）并直连原生窗口，保存代码在 **30ms 内热替换生效**。
3. **极速增量编译与原地刷新 (`desktop/update.bat`)**：
   - 修改前端代码后双击 `desktop\update.bat`，3 秒内完成 Rollup 增量构建。
   - 桌面窗口无需重启，直接在窗口内按下 **`F5` 或 `Ctrl+R`** 即可就地刷新生效。
4. **生命周期闭环**：
   - 窗口关闭时自动注销后端服务，无后台残留僵尸进程，彻底杜绝 8002 端口冲突。

### 历史备选方案（可选扩展）

- **Tauri 2.0 原生架构 (`src-tauri/`)**：需本机安装 Rust/Cargo 与 C++ 工具链，执行 `npm run tauri:dev`。
- **Electron NSIS 独立安装程序**：可通过 `build_desktop.ps1` 编译为完整的独立 NSIS 安装包。

---

## 4. 实时流畅度诊断与性能监控 (FPS & Performance HUD)

在桌面端调试与使用过程中，界面内置了两级实时性能诊断工具：

- **左上角实时帧率开关 (`FpsMeter.tsx`)**：
  - 点击左上角 `FPS` 印刷风格滑块即可开启实时测速（如 `60 FPS`、`144 FPS`）；关闭时彻底销毁 rAF 循环，0 开销。
- **右上角核心性能诊断仪表盘 (`PerformanceHUD.tsx`)**：
  - 随帧率开关联动开启，常驻右上角；
  - 实时监控三大核心指标：**单帧耗时 (FT)**、**Chromium/WebView2 堆内存 (Heap)** 与 **视口空间裁剪率 (Viewport Culling)**；
  - 自动捕获 >50ms 的长任务阻塞（Long Tasks），点击展开详细诊断抽屉，助力排查大图缩放与撤销历史性能。

---

## 5. 跨端图钉持久化与双向同步

- 桌面端与浏览器 Web 端共用后端 SQLite `pins` 表。
- 启动时自动双向比对并同步 1~8 号图钉世界坐标与缩放比例，通过 `Ctrl+1~8` 可在桌面端无缝快速跳转，跨客户端永不丢失。

