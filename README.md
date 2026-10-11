# Drop-it 0.1

[English](README.en.md) · 简体中文

Drop-it 是一个运行在单张二维无限画布上的知识收集与整理看板。

区别于采用文件夹层级、侧边栏或固定分栏的传统笔记工具，Drop-it 将网页链接直接解析为包含封面与摘要的可视化卡片，与 Markdown 文本、图片一同放置在无边界的画布中，通过自由排布、弹性分组与树状连线构建直观的知识网络。

---

## 主要功能

- **链接可视化**：粘贴或拖入网页 URL 自动抓取标题、描述、图标与封面图，生成自适应比例的网页卡片。
- **截图关联本地文件（实验性）**：Windows 桌面版运行时，用微信 `Alt+A` 截取已保存的 Photoshop、WPS PDF 或 WPS 演示文档，粘贴后尝试生成截图头图与原文件链接卡；也可右键按住划到“来源文件 → 关联文件”手动添加、更换或移除来源。
- **单张无限画布**：不设文件夹与强制分区，所有内容在同一张 2D 画布中自由平移、缩放与排布，降低记录与分类门槛。
- **空间分组 (Group)**：框选卡片即可一键编组（Ctrl+G），生成自适应凸包多边形轮廓；支持整组等比缩放及一键收起为列表。
- **树状关联 (Origin)**：创建圆形原点节点（Ctrl+J），在卡片、分组与原点之间建立父子连线，支持联动位移与分类调色。
- **快速定位与导航**：支持 1~8 号图钉平滑跳转（Ctrl+1~8）、常驻小地图（按住 M 放大）、全览（Shift+1）与全文检索（Ctrl+K）。
- **原子化工作区 (.drop)**：将画布卡片、分组关系、视口、图钉及本地资源完整保存为单个 `.drop` 文件；支持后台自动暂存与重启续接。

---

## 技术规范

| 维度 | 技术选型 / 规范 | 说明 |
| :--- | :--- | :--- |
| **操作系统** | Windows 10 / 11 (64-bit) | 依赖系统预置的 Microsoft Edge WebView2 Runtime |
| **桌面视窗** | pywebview + Edge WebView2 | 共享系统内核与硬件加速，冷启动常驻内存 40~60MB，支持 Windows 原生贴靠 |
| **前端架构** | React 18 + TypeScript + Vite | DOM 变换矩阵 + SVG 拓扑连线 + 空间索引视口裁剪 (LOD) |
| **后端服务** | FastAPI + SQLite (WAL 模式) | 本地回环 (127.0.0.1:8002)，提供站点元数据抓取、WebP 缩略图与 RapidOCR |
| **数据解耦** | `%LOCALAPPDATA%\InfiniteCanvasNote\data\` | 用户数据库与图片资源与源码物理隔离，大量图片不影响前端与安装包编译速度 |
| **开发环境** | Node.js >= 18.0, Python >= 3.10 | 仅源码开发所需；普通用户运行发布包无需安装 |

---

## 快速开始

### 最新源码功能：截图来源文件

2026-10-11 的源码已接入本地文件卡。下载/更新 `main` 后执行 `npm run dev`，并重启桌面窗口以加载原生监听器。旧版 Releases 安装包不会随源码推送自动更新。

1. 先启动 Drop-It 桌面版，再在已保存的文档上用微信默认快捷键 `Alt+A` 截图。
2. 选区完全位于来源窗口且没有标注或像素改动时，粘贴到 Drop-It 会尝试自动关联。
3. 首次点击卡片选中，再点击底部路径，用系统默认软件打开原文件。
4. 未能自动识别时，按住右键划到“来源文件 → 关联文件”，在目标功能上松开。

自动适配基于本机 Photoshop 2024、WPS PDF 和 WPS 演示的接口及受控微信样本，仍属实验功能。QQ、其他快捷键、其他 PDF 阅读器、微软 PowerPoint、标注与跨窗口截图尚未认证；多实例或证据不足时保留普通图片。来源记录仅在内存保留最多 5 分钟，新的剪贴板内容会使旧记录失效。

画板只保存截图和文件引用，不复制 PSD、PDF、PPTX 等原文档。文件移动、删除或换到另一台电脑后需重新关联；有未保存编辑时，链接指向磁盘文件而非截图时的版本。OCR、复制、撤销、刷新、暂存与 `.drop` 保存保留来源字段。网页版可显示文件卡，但本地打开和关联需要 Windows 桌面版。

测试范围和限制见 [来源功能验证记录](FILE_SOURCE_FEASIBILITY.md) 与 [产品方案](FILE_SCREENSHOT_PLAN.md)。

### 1. 下载使用（推荐）
从 [GitHub Releases](https://github.com/lalala625k-ops/drop-it-/releases) 下载最新版本：
- **免安装版**：解压 `Drop-it-0.1-Portable.zip`，双击运行 `DropIt.exe`。
- **安装版**：运行 `Drop-it-Setup-0.1.exe`，按向导安装到本地并创建快捷方式。

### 2. 源码运行
```powershell
# 安装依赖
python -m pip install -r backend/requirements-desktop.txt
npm --prefix frontend install

# 启动开发模式（WebView2 壳 + Vite HMR 热更新）
npm run dev

# 或直接运行已构建的桌面版本
npm run desktop:start
```

---

## 目录结构

```text
note/
├── frontend/             # 前端 React 源码与画布交互管线
├── backend/              # 本地 FastAPI、SQLite 存储与站点解析器
├── desktop/              # Windows 原生 WebView2 宿主与打包脚本
├── Files/                # 本地工作区目录 (Template 示例 / Save 手动存档 / Temporary 自动暂存)
└── 启动桌面版.bat         # 根目录一键启动入口
```

---

## 详细技术文档

- [产品需求规格说明书 (PRD)](product_requirements_document.md)
- [桌面端技术手册与架构规范 (DESKTOP_SPEC)](DESKTOP_SPEC.md)
- [设计系统规范 (DESIGN_SPEC)](DESIGN_SPEC.md)
- [代码架构与文件地图 (ARCHITECTURE.md)](ARCHITECTURE.md)
- [设置名称与快捷键对照表 (SETTINGS_NAMES.md)](SETTINGS_NAMES.md)

---

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。
