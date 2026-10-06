# Drop-it 0.1

把链接、文本、照片全部变成卡片，并放在一张大画布上。随意整理。

把自己想记住的东西拖进来，逐步构建一张高度可视化的知识网络。

## 主要功能

1. **链接卡片**：解析网页链接，生成包含标题、描述和封面的可视化卡片。
2. **文本记录**：支持 Markdown 格式输入，直接在画布上记录和编辑。
3. **图片整理**：拖入或粘贴图片，自由移动、缩放和整理。
4. **分组与关联**：各类卡片支持打组，卡片、分组和原点之间可建立树状关联。
5. **快速跳转**：通过搜索、图钉、小地图和全览，在画布中快速定位。

## 快速开始

推荐使用 Windows 10/11 桌面模式。

普通用户可从 [GitHub Releases](https://github.com/lalala625k-ops/drop-it-/releases) 下载：

- **免安装版**：将 `Drop-it-0.1-Portable.zip` 解压到 `Drop-it 0.1` 文件夹，双击其中的 `DropIt.exe`。
- **桌面安装版**：运行 `Drop-it-Setup-0.1.exe`，安装到当前用户目录，并创建桌面和开始菜单快捷方式。

两种发布版均无需 Python 或 Node.js，需要 Microsoft Edge WebView2 Runtime。首次启动打开唯一示例 `Template一.drop`，首次“打开”定位 `Files/Template`。

### 从源码运行

运行源码前，请安装 Python、Node.js 和 Microsoft Edge WebView2 Runtime。

拉取或解压源码后，在项目根目录执行：

```powershell
python -m pip install -r backend/requirements-desktop.txt
npm --prefix frontend install
npm run desktop:start
```

首次启动会在缺少前端构建文件时自动构建。之后也可以双击根目录的 `启动桌面版.bat`。

## 其他运行方式

| 方式 | 操作 | 用途 |
|---|---|---|
| 开发模式 | `npm run dev` | 使用 WebView2 开发壳，前端修改实时更新 |
| 浏览器模式 | 执行 `npm run build`，再双击 `open_site.bat` | 在本机浏览器中使用 |
| 自行打包 | `npm run desktop:dist` | 生成 Windows 发布包，需要额外安装 7-Zip 和 NSIS |

使用已打包的免安装版时，解压完整目录后双击 `DropIt.exe`。无需安装 Python、Node.js，仍需 WebView2 Runtime。

构建产物位于 `release/Drop-it 0.1/`、`release/Drop-it-0.1-Portable.zip` 和 `release/Drop-it-Setup-0.1.exe`。根目录的 `打开免安装版.bat` 可直接打开免安装文件夹；本机另有同名 Windows 快捷方式，快捷方式不纳入 Git。NSIS 编译器可通过 `PINBOARD_MAKENSIS` 指定。

## 文件与恢复

默认在项目根目录或发布版 EXE 所在目录创建：

```text
Files/
├── Template/     示例文件
├── Save/         手动保存的 .drop 文件
└── Temporary/    自动暂存与恢复记录
```

- 源码和发布包仅包含 `desktop/Template/Template一.drop` 这一份示例；发布时放入 `Files/Template`，`Save` 和 `Temporary` 初始为空。
- 使用“保存”或“另存为”写入正式 `.drop` 文件；首次保存默认进入 `Files/Save`。
- 后台自动暂存不覆盖正式文件，用于重启续接和历史恢复。
- 默认停止操作后 5 秒暂存；持续操作时最长间隔 30 秒，每个画板保留最近 5 个不同状态。
- 保存和暂存目录可在“通用设置”中调整。默认目录不可写时，使用用户本地应用目录，并显示实际路径。
- 数据库、图片等运行数据默认位于 `%LOCALAPPDATA%\InfiniteCanvasNote\data`，与上述文件目录分别管理。
- 桌面安装版卸载保留 `Files` 和用户运行数据；更新程序前请备份个人画板。

## 公开源码与本地配置

本机密钥使用 `.local.json`、`.local.csv` 或 `.env` 文件，均不纳入 Git。个人 `.drop`、数据库、日志、恢复记录及构建产物也被忽略，只有指定 Template 示例例外。请通过 GitHub Releases 分发安装包和免安装 ZIP，避免上传整个本机工作目录。

## 技术与结构

前端使用 React、TypeScript 和 Vite；后端使用 FastAPI 和 SQLite；Windows 桌面壳使用 pywebview 与系统 WebView2，发布时通过 PyInstaller 打包。

```text
frontend/    前端界面与画布交互
backend/     本地服务、数据存储与内容解析
desktop/     Windows 桌面壳与启动脚本
```

## 详细文档

- [产品需求](product_requirements_document.md)
- [桌面运行与发布](DESKTOP_SPEC.md)
- [设计规范](DESIGN_SPEC.md)
- [代码架构](ARCHITECTURE.md)
- [设置名称与快捷键](SETTINGS_NAMES.md)

源码采用 [MIT 许可证](LICENSE)。第三方依赖及示例中的外部内容仍适用各自的许可证和权利声明。
