# 项目架构与文件职责地图

> **同步日期**：2026-10-06。本文说明当前工作区的结构、职责和数据流；产品行为见 `product_requirements_document.md`，视觉规则见 `DESIGN_SPEC.md`，站点保护范围见 `image_parsing_rules.md`。已知实现限制应明确记录，不能把计划能力写成已经实现。

> **桌面端与网页端架构**：开发与发布统一使用 `desktop/app.py` 的 Windows 原生 Edge WebView2 壳。开发时由壳管理 FastAPI 线程和 Vite 热更新服务，每个新画板使用独立后端及 Vite 动态端口、同步当前源码；发布时由 PyInstaller 固化启动器和后端服务，目标用户无需安装 Python 或 Node.js，需有系统 WebView2 Runtime。桌面壳共享 `frontend/` 与 `backend/`，数据统一存储于 `%LOCALAPPDATA%/InfiniteCanvasNote/data`；根目录保留 `启动桌面版.bat` 快速入口。`backend/services/storage.py` 使用 SQLite WAL，支持卡片、分组及 1~8 号图钉持久化；画布视口裁剪使用空间索引，远景大量对象由 `FarCanvas.tsx` 简化绘制。

## 1. 架构与维护原则

- 前端为 React 18 + TypeScript + Vite + Tailwind CSS；近景画布由 DOM 的位移/缩放实现，远景大量对象用 Canvas 简化绘制，连线与外层 Group 轮廓使用 SVG。后端为 FastAPI，卡片、外层 Group 与圆形原点保存在 SQLite。
- `components/` 负责呈现和事件绑定，部分组件仍包含局部编辑状态；跨组件业务状态与交互调度放在 `hooks/`，几何和字符串计算放在 `utils/`。
- `utils/storage.ts` 是有副作用的存储适配器，包含 LocalStorage、网络请求及文件持久化读写；其他计算工具应保持纯函数，不依赖 React Hook。
- 新增模块尽量控制在 150～200 行。现有 App、交互 Hook、轮盘和正文组件等仍超过这一目标，后续修改时按职责逐步拆分。
- 新增、移动或拆分模块时同步更新本文；受保护站点遵守图片解析台账，不擅自改动锁定解析逻辑。

## 2. 根目录与运行配置

| 文件/目录 | 职责 |
| :--- | :--- |
| `product_requirements_document.md` | 当前功能、交互、存储边界、数据模型和已知限制 |
| `DESIGN_SPEC.md` | 默认视觉规则、主题色、标题字阶及实现差异 |
| `image_parsing_rules.md` | 保护库、试验库、通用解析规则及迁移流程 |
| `SETTINGS_NAMES.md` | 设置分类、51 项操作和控件的完整中英名称与当前默认快捷键对照 |
| `package.json` | 根目录 `npm run dev` 启动 WebView2 热更新开发壳；`desktop:start` 日常运行，`desktop:dist` 构建 Windows 发布包 |
| `启动桌面版.bat` | 根目录一键启动原生 Edge WebView2 轻量桌面版快捷入口（转调 `desktop/run.bat`） |
| `desktop/` | 桌面端专属工程目录；包含 `app.py`（WebView2 引擎入口）、`dev_server.py`（IPv4 Vite 启动与 HTTP 就绪检查）、`close_checkpoint.py`（关闭暂存与所属进程树清理）、`icons/`（应用图标）、`Template/Template一.drop`（示例源文件）、`run.bat`、`run_dev.bat`（HMR 热更新）、`update.bat` |
| `DESKTOP_SPEC.md` | 桌面端技术栈、独立架构、高帧率渲染管线与运维说明专篇规范 |
| `open_site.bat`、`local_site.pyw` | 无控制台的本机使用入口；后台由 FastAPI 在 127.0.0.1:5173 同时提供构建好的网页与 API，关闭 Codex 或浏览器后服务继续运行；需先生成 `frontend/dist` |
| `LOCAL_USE.md` | 发布前本机使用、构建更新及故障排查说明 |
| `backup_database.bat` | 从 SQLite 导出一致的 JSON 和资源到 `backend/data/` 独立 Git 仓库，再提交、拉取并推送 `origin/main` |
| `.gitignore` | 忽略依赖、构建输出、Python 缓存及独立管理的 `backend/data/` |
| `.reverse-image.local.json` | 本机反向识别视觉模型凭据与接口配置；Git 忽略，不随代码提交 |
| `.agents/`、`skills/` | 项目工作流技能与参考材料，包括代码精简技能 |
| `frontend/package.json` | 共享前端依赖、`build`（tsc + Vite）和剪贴板验证命令；开发服务由 WebView2 启动器直接调用 Node/Vite |
| `frontend/vite.config.ts` | 壳内开发服务监听 `127.0.0.1:5173`；`/api` 代理到壳管理的后端 8002；Vite 不创建后端进程 |
| `frontend/tsconfig.json` | TypeScript 编译配置 |
| `frontend/tailwind.config.js` | 颜色、字体、字距和圆角 token |
| `frontend/postcss.config.js` | Tailwind 与 Autoprefixer 插件配置 |
| `frontend/index.html` | 挂载节点、初始底色及 Google Fonts Inter 400/700 字重加载 |

## 3. 前端文件职责（`frontend/src/`）

### 3.1 入口、类型与常量

- `main.tsx`：React 挂载入口、StrictMode 和全局样式导入。
- `App.tsx`：组织各 Hook、DOM 画布层、SVG 连线、卡片、原点和弹窗；在捕获阶段将对象上的画布导航手势交给画布，并按鼠标按下状态控制选中框显示；空白右键按下打开画布命令饼菜单。
- `index.css`：默认浅色主题、无网格画布、字体和 3px 滚动条。
- `types/index.ts`：定义 `CardType`、`Card`、`Group`、`Viewport`、`Rect`、`SnapLine`、`HistoryState`。视口使用 `x/y/zoom`；`Card.groupId` 指向树中的唯一父节点（卡片、外层 Group 或圆形原点），`Card.bundleId` 表示外层 Group 成员。`Group.parentIds` 为兼容旧数据保留数组字段，但只使用一项。`Group.kind` 区分两类节点，旧数据无 kind 时视为原点。
- 圆形节点的界面名称统一为“原点”（Origin），默认标题为“原点 N”；持久化字段、对象 ID 和快捷键设置键继续沿用 `parent` / `newParent`，保持已保存画板与自定义快捷键兼容。

### 3.2 工具层（`utils/`）

| 文件 | 职责 |
| :--- | :--- |
| `canvas.ts` | 屏幕/世界坐标转换、矩形相交、包围盒、全览与单卡聚焦视口计算 |
| `snap.ts` | 卡片拖动磁吸偏移及水平/垂直辅助线计算；当前由单卡拖动路径调用 |
| `alignment.ts` | 卡片和圆形原点的上下左右对齐，按外接矩形处理固定障碍物和已就位对象，默认 5px 间距；选中的外层 Group 在 `useCanvasActions.ts` 中展开为成员卡片 |
| `packing.ts` | 卡片自动装箱排版，返回 ID 到位置的映射 |
| `dateParser.ts` | 日期、时间和自然语言输入解析与格式化 |
| `headingUtils.ts` | 解析标题的 `# `、`## ` 前缀，更多井号映射为二级，返回级别、原文和去前缀文本 |
| `cardBounds.ts` | 统一计算卡片本体加悬浮标题的逻辑边界，供框选、碰撞、避让、对齐、装箱和视口使用 |
| `textCardSize.ts` | 以默认 15px 字号测量文本宽度并估算换行，为新建和外部粘贴的文本卡片确定紧凑宽高 |
| `cardDefaultSize.ts` | 记录与推断卡片默认尺寸；组外卡片复位时保持中心位置，旧数据按内容或类型回退 |
| `feishu.ts` | 识别飞书/Lark 域名并提供飞书图标地址；前端将飞书网页卡统一按无封面显示 |
| `tagUtils.ts` | 统计已有标签频率，生成高频列表，不足时补入建议标签 |
| `groupRelations.ts` | 统一树节点的父子关系、后代遍历、环检测与旧多父连接规范化；外层 Group 的成员视为该 Group 的下级 |
| `linkEndpoints.ts` | 按卡片矩形、原点圆形和 Group 展开/收起轮廓，计算两对象边界最近的连线端点与交互引线起点 |
| `treeTargets.ts` | Ctrl+Shift 引线连接时查找卡片、外层 Group、圆形原点目标与中心点 |
| `groupColors.ts` | 四个渐变节点、连续取色插值及文字对比色计算 |
| `pieMenuGeometry.ts` | 对象与空白画布菜单共用的边缘定位、钟面坐标、右键划动阈值和方向扇区命中 |
| `radialMenuModel.ts` | 统一命令名称、固定钟面角度、文件/排版/组/识别四个分支及其固定子项 |
| `radialMenuGeometry.ts` | 两级圆形布局、子按钮优先命中、间隙保护、连线边界与包含全部子项的边缘定位 |
| `groupMenuActions.ts` | 多选的解组、移出组、断线一次计算，保留存活上级继承和成员位置，重算剩余 Group 边界 |
| `storage.ts` | 首次读取随包 `.drop` 示例（浏览器保留内置示例兜底）、立即写入带待同步标记的 LocalStorage、400ms 防抖及按对象修订号同步、刷新恢复，以及 `.drop` 工作区保存/读取 |
| `pendingImages.ts` | 在 IndexedDB 按卡片 ID 暂存原始图片，刷新时恢复因 LocalStorage 容量限制剥离的 Base64 图片 |
| `ingestScreenshot.ts` | 粘贴/拖入图片时立即建卡并暂存原图；上传后确认资源地址可解码才替换本地原图，不可读时保留原图和 IndexedDB 副本 |
| `recognizeCardImage.ts` | 图片卡右键 OCR/原链接识别请求及转换字段；收集接口阶段记录，原链接未命中时保留图片 |
| `manualSearch.ts` | 前端手动搜索链接兜底 |

`components/RecognitionDiagnostics.tsx` 和 `components/ReverseResolutionPanel.tsx` 是保留的识别调试组件；当前 `App.tsx` 不挂载它们，识别记录、候选结果和右侧调试面板不会出现在前端。

### 3.3 状态与交互层（`hooks/`）

| 文件 | 职责 |
| :--- | :--- |
| `useViewport.ts` | 视口和光标坐标、指针锚定滚轮缩放、单卡聚焦/还原、全览；滚轮手势中先更新画布 transform，接近裁剪边界时同步 React 状态，结束后提交最终视口与 LOD；以 `pinboard_viewport_v1`、200ms 防抖记忆视口 |
| `useVirtualViewport.ts` | 空间视口严格虚拟化；基于视口边界与安全缓冲（当前由 App 传入 300px）动态裁剪离屏对象，使用 ID 索引保留选中和关联对象，返回可见卡片 ID 供连线裁剪，并单独统计真实视窗内卡片数供近景清晰度策略使用 |
| `useCanvasInteractions.ts` | 鼠标手势状态机：平移、Alt+中键指针锚定连续缩放、框选、拖动、Ctrl+Shift 引线连接或单击断开、卡片缩放、轮盘；卡片与外层 Group 可连到卡片、Group 或圆形原点，拒绝成环；普通拖动带动自身后代，Ctrl 拖动只移动当前对象（Group 含成员） |
| `useCanvasActions.ts` | 新建、更新、删除、解散、编组、撤销、装箱、方向对齐、组外卡片恢复默认尺寸及全部卡片按平均宽度统一宽度；选中外层 Group 时展开成员卡片参与对齐，重算并保存组边界；`commitState` 更新卡片/原点并排队保存 |
| `useCanvasInit.ts` | 加载时把旧多父关系收敛为单父树，修正 Group 成员的文字缩放比例，保持旧原点中心并统一尺寸为 120px；恢复视口或全览；注册关闭前刷新 |
| `useCanvasDrop.ts` | 处理首个拖入图片文件、JSON 备份，或将外部图片 URL、网页链接和文本交给共用摄入流程 |
| `useSelection.ts` | 卡片、外层 Group、原点与图钉选中集合，Shift 选择、清空及框选；几何判定在 `marqueeSelection.ts`，普通框选支持所有类型，展开 Group 内的小范围框选保留单独成员选择，收起组使用完整成员列表计算高度 |
| `useCardDrag.ts` | 拖动初始坐标与位移、单卡 Shift+Space 磁吸及连接目标检测；普通拖动联动下级分支、Ctrl/Cmd 仅移动当前对象由 `useCanvasInteractions.ts` 处理 |
| `useBundleGroups.ts` | 外层 Group 的无名无色创建、包含成员悬浮标题的凸包轮廓与动态边界、收起/展开、整体拖动与四角等比缩放；所有成员内容随组缩放，恢复默认大小按组中心复位所有成员；拖动卡片松手时按中心点由外跨入轮廓/收起列表判断入组；指定原点的整组断线及解散；变更走历史与防抖保存 |
| `useCardResize.ts` | 八向缩放、Ctrl+Alt 水平拖动等比缩放及尺寸限制；保留原点缩放辅助接口 |
| `useClipboardPaste.ts` | 键盘与菜单粘贴共用结构化快照识别，跨窗口对象暂存并等待鼠标单击；不按相同正文匹配当前窗口旧快照；外部图片、图片 URL、网页链接和文本立即创建，图片文件调用共用截图摄入函数 |
| `useCardClipboard.ts` | 复制/剪切选中的卡片、原点、外层 Group、图钉及选中组的成员；系统剪贴板写入成功后剪切才移除原对象并记录历史、保存；异步写入期间对象变化则保留原件。暂存跟随鼠标的粘贴快照，单击后按整体中心放置并重建 ID 与内部关系；图钉使用空闲编号，容量不足时整次粘贴停止。Ctrl+D 仍直接克隆选中卡片 |
| `canvasClipboard.ts` | 按选区收集卡片、Group、原点和图钉，选中外层 Group 时收集成员，单独复制成员不补入其 Group；计算整体包围盒与中心、克隆并重映射内部关系，图钉保持相对坐标及缩放并分配空闲编号；跨画板不连接未复制的上级；剪切仅删除快照对象、清理悬空关系并刷新剩余 Group 边界 |
| `canvasClipboardTransport.ts` | 带类型/版本标记的完整 JSON 快照，兼容后端保存产生的可选字段 `null`，校验并规范化后读取；写入时也移除可选字段的空值，兼容仍使用严格旧读取逻辑的窗口，保留显式空连接及日期语义。写入标准 HTML 携带快照以兼容 WebView2，读取兼容自定义 MIME；同时提供外部应用可用的纯文本/PNG。识别为画布数据却读取失败时提示重新复制，不降为一张文本卡 |
| `clipboardImages.ts` | 将源窗口本地图片嵌入剪贴板，目标按新卡片 ID 暂存原图并上传自身资源目录；只有返回资源可解码时才替换原图 |
| `ClipboardPastePreview.tsx` | 粘贴确认前显示跟随鼠标的卡片、原点、Group 和连线轮廓 |
| `useGroups.ts` | 原点状态、命名、新建和绑定；默认 120px 与四色循环默认色；空原点新建执行有限次数的 5px 避障；`refreshGroupBounds` 保持独立节点边界 |
| `useHistory.ts` | 最多 30 份卡片/Group/原点/图钉深拷贝快照，提供 `pushHistory` 和 `undo`，当前没有 redo |
| `useCanvasPins.ts` | 管理 1~8 编号图钉，支持本地 localStorage 极速响应与后端 SQLite（`/api/cards/pins`）双向持久化同步，拖拽位置更新、280ms 缓动平滑跳转动画、添加/更新/删除及弹窗提示交互 |
| `useShortcuts.ts` | 新建、删除、撤销、编组/解散、Alt/Ctrl+方向键对齐、复制、Ctrl+X 剪切、搜索、`.drop` 保存、粘贴监听；Ctrl+1~8 仅跳转对应图钉，无图钉时不操作；Shift+1 全览，Ctrl+E 无全览绑定；F5 刷新，Ctrl+R 恢复尺寸；M 键及失焦控制小地图 |
| `useMinimapState.ts` | M 键控制常驻小地图的大图模式，几何映射在 `MinimapNav.tsx` |
| `usePieMenuState.ts` | 以卡片、外层 Group、原点的显式目标类型记录当前轮盘；处理日期/标题/标签及原点颜色、图片识别、网页重新解析、历史与保存 |
| `useSettings.ts` | 管理自定义快捷键映射与通用偏好（滚轮方向、小地图模式），保存在 `pinboard_settings_v1` |

### 3.4 组件层（`components/`）

| 文件 | 职责 |
| :--- | :--- |
| `CardComponent.tsx` | memo 卡片容器、坐标/尺寸/层级、加粗边框、链接点击保护、300ms 描述提示和子组件组装；组内卡片屏幕较短边不大于 20px 时显示简化缩略图；近景少量或聚焦卡片时切换原图并触发清晰重栅格化 |
| `ImageCanvasLayer.tsx` | 保留的实验性图片合成层；当前不由 `App.tsx` 挂载，图片统一走可靠的 DOM `<img>` 渲染，避免 Canvas 加载失败时只剩卡片边框 |
| `useCanvasCards.ts` | 过滤收起 Group 成员并缓存去色卡片投影，保持静止卡片对象引用，让 React 跳过拖动过程中无关卡片的渲染 |
| `card/CardBodyContent.tsx` | 图片/网页/纯文本渲染；文字卡选中后可直接编辑和选择正文，失焦清除并重建文本框以移除残留选区，按组缩放比例调整未锁定卡片尺寸；网页原标题编辑、封面比例调高；近景模式对图片和网页封面使用原图、优先解码，飞书网页卡隐藏封面并显示图标 |
| `FeishuLogo.tsx` | 飞书网页卡标题和收起 Group 列表使用的图标，远程图标失效时回退到文字标记 |
| `card/CardHeaderBadges.tsx` | 日期徽标；标签由正文分支绘制 |
| `card/CardResizeHandles.tsx` | 八向缩放手柄和方向类型 |
| `card/FloatingHeaderTitle.tsx` | 独立悬浮标题、两级显示、就地编辑保存；24px/900 或 18px/700 |
| `GroupComponent.tsx` | 120px 圆形原点、选中仍保留组色并加深轮廓、圆内名称和关联数量、圆内名称编辑及保留子卡片的解散按钮 |
| `BundleGroupComponent.tsx` | 外层 Group 凸包多边形虚线轮廓与组色淡填充、最近凸包顶点上的四个缩放点、透明底悬浮名称、轮廓外左上方的方形收起/展开按钮、收起态成员列表及网站图标、右键饼菜单入口 |
| `MinimapNav.tsx` | 左下角常驻小地图与居中的 M 键大图、世界范围/比例、卡片/圆形原点缩略图及展开 Group 的凸包色区；内容边界只随卡片和 Group 变化重新计算；组内卡片不绘制，Group 与独立卡片优先继承所连原点颜色，无色时为黑色；单击 100% 居中和拖框适配视口 |
| `ParentLinkLines.tsx` | 树中任意上级节点到卡片或 Group 的 SVG 连线；两端都落在对象边界的最近点，选中节点会加粗其后代分支 |
| `SnapGuides.tsx` | 拖动磁吸的水平/垂直辅助虚线 |
| `SelectionBox.tsx` | 框选矩形 |
| `CanvasCommandMenu.tsx` | 空白菜单按选择能力构建固定方向的命令项，文件、排版、组使用共享二级分支；粘贴始终读取系统剪贴板 |
| `RadialCommandMenu.tsx` | 共享两级圆形菜单，中心与分支树状连线、悬停提示、右键轻点保留/划动执行、左键点击、Escape 关闭 |
| `CanvasPinsLayer.tsx` | 在画布表面世界坐标渲染内凹倒角十字星与同心数字圆点图钉，支持框选反馈、Shift 单击切换选中、按住拖拽自由平移、悬停数字弹跳、缩放自适应、点击未选图钉平滑跳转、右键或右上角 ✕ 快速移除；几何与粘贴预览共用 `canvasPinGeometry.ts` |
| `PinInputModal.tsx` | 极简直角印刷风格的图钉编号选择弹窗，提供 1~8 数字快速选择方格与占用提示，支持键盘单键 1~8 快速确认 |
| `MarkdownView.tsx` | 全局 4 处指定位置的 Markdown 语法解析与排版渲染组件，严格匹配一级 24px (900)、二级 18px (700) 与正文 15px (400) 字阶 |
| `SettingsModal.tsx` | 设置微画布容器、当前分类、全览与 Escape 关闭，以及恢复记录弹层 |
| `settings/SettingsTree.tsx` | 六分类入口、操作和独立按键卡片、目录输入及有效偏好控件 |
| `settings/SettingsNode.tsx` | 白底黑边直角节点、层级边框及可点击/固定状态的统一渲染 |
| `settings/shortcutCatalog.ts` | 导航、便签、分组、排版、工作区、编辑六区共 51 项操作的中文/英文名称、按键、适用范围；七项自定义按键读取实时配置 |
| `settings/settingsTreeLayout.ts` | 分类总览、展开清单的两列布局、避开节点的折线连接，以及动态全览/聚焦边界 |
| `settings/useSettingsView.ts` | 设置微画布的平移、指针锚定缩放、分类聚焦、窗口尺寸变化时重新适配 |
| `settings/useShortcutRecording.ts` | 快捷键录制、Escape 取消、占用检查及沿用旧设置持久化；仅七项支持录制 |
| `GradientColorArc.tsx` | 将黄、粉、蓝、白渐变绘成左侧 64 档半圆环，悬停显示白色主环与凸出的当前色扇形，按点击或拖动位置取色并提交 |
| `CanvasModals.tsx` | 聚合对象轮盘、焦点蒙版、搜索及小地图；解析显式菜单目标并按对象能力连接操作 |
| `PieMenuFocusOverlay.tsx` | 对象轮盘打开时覆盖搜索弹窗的 Ink/30 模糊蒙版，并把当前对象的 DOM 快照原位显示在蒙版上方；外层 Group 同时保留可见的组内卡片 |
| `SearchModal.tsx` | 卡片字段的大小写不敏感子串过滤；输入后显示单行便签结果；键盘选择和聚焦 |
| `PieDateMenu.tsx` | 对象能力筛选固定方向的一级和四类二级命令；标题、标签、原点颜色保留一级入口；使用共享 RadialCommandMenu 渲染及命中 |
| `PieDateInputModal.tsx` | 日期输入、解析校验、保存和清除 |
| `PieTagModal.tsx` | 标签检索、新标签输入和勾选切换 |
| `PieTitleInputModal.tsx` | 悬浮标题输入/清除，保留 Markdown 字符并提示原标题 |
| `DesktopWindowControls.tsx` | 桌面 `desktop=1` 模式下的顶部悬停标题栏、拖动期间保持显示、双击最大化/还原及常驻窗口按钮；左键拖动事件向上传至 pywebview 的 body 监听器，`App.tsx` 对 `data-desktop-titlebar` 跳过画布交互，显隐样式位于 `index.css` |
| `FpsMeter.tsx`、`PerformanceHUD.tsx` | 保留的性能调试组件；当前 App 不挂载，不显示在前端工具栏 |

## 4. 后端文件职责（`backend/`）

| 文件/目录 | 职责 |
| :--- | :--- |
| `main.py` | FastAPI/CORS、路由模块、DynamicStaticFiles 动态资源挂载及启动时缩略图后台预热批处理 |
| `routes/cards.py` | CardModel、GroupModel、PersistencePayload；GET 全量读取，POST 按对象保存校验修订号；GET/POST `/api/cards/pins` 图钉持久化同步 |
| `routes/assets.py` | POST `/api/upload-asset` 每次按当前存储目录上传原图，生成成功后才返回缩略图地址；GET `/api/thumbnails/{category}/{filename}` 动态或缓存提供 800px WebP 缩略图 |
| `services/asset_recovery.py` | 图片读取时按哈希文件名恢复切换目录后遗留在默认目录的原图；只补缺失资源，不覆盖已有文件或恢复其他画布数据，发布空白模式不执行 |
| `routes/parser.py` | POST `/api/recognize-image` 和 `/api/resolve-image` 支持上传文件、Base64 JSON、原始请求体；GET `/api/fetch-metadata` |
| `routes/settings.py` | GET/POST `/api/settings/storage-path` 数据目录查询与迁移；POST `/api/storage/save`、POST `/api/storage/open`、GET `/api/storage/load` 负责 `.drop` 保存、原生选择打开与启动读取，并在首次空工作区安装 `desktop/Template/Template一.drop`；旧 `/api/archive/*` 接口保留但当前前端没有导入导出入口 |
| `services/storage.py` | SQLite WAL 对象存储、修订号校验、图钉 `meta` 持久化、force_replace_all 全量覆盖还原、旧 JSON 迁移及 Git 快照导出 |
| `services/template_paths.py` | 按程序所在目录定位 `Files/Template/Template一.drop`；开发时从 `desktop/Template/` 复制初始示例，旧发布包从原 Template 目录复制，保留已有模板，不依赖用户桌面或 PyInstaller 临时解包目录 |
| `services/thumbnail_service.py` | WebP 800px 缩略图金字塔管道，支持透明通道保留、EXIF 自动校正、原子落盘与已有媒体后台批量预生成 |
| `services/ocr_service.py` | RapidOCR 初始化、Pillow 预处理、首行标题和全文；不可用或出错时返回失败结果 |
| `services/screenshot_link_service.py` | 保留从 OCR 文本提取 B 站/X 直接链接或 BV 号的兼容函数；原有文字搜索不再进入主溯源链路 |
| `services/bilibili_reverse_service.py` | 保留 OCR 几何提取与 B 站官方备用搜索接口；反向搜索与受保护的正向解析器独立 |
| `services/reverse_direct_service.py`、`reverse_resolution_search.py` | 提取截图中明确可见的链接/编号；按 AI 标准化字段执行站内和目标域名搜索，过滤搜索页、排序候选并区分自动命中与待确认 |
| `services/reverse_qr_service.py`、`reverse_vision_service.py`、`reverse_vision_prompts.py` | 二维码预检；从环境变量或本机忽略配置读取 Key，使用 Gemini 或 Qwen 视觉提示词提取站点、标题、作者与检索指纹；模型输出仅作线索，不直接作为原链接 |
| `services/reverse_instagram_caption.py`、`reverse_site_fingerprints.py` | Instagram 无独立标题时从 OCR 正文提取检索词；Matrix 少数派页面的强特征在模型误判后纠正平台与域名 |
| `services/reverse_manual_search.py`、`reverse_trace.py` | 构造只含标题或 Instagram OCR 正文的人工搜索入口；记录阶段、HTTP 状态和安全化后的接口地址，不记录密钥 |
| `services/reverse_layout_service.py`、`reverse_search_service.py`、`reverse_platform_service.py` | 提供 OCR 布局与搜索帮助函数；主链路复用平台域名、内容页校验以及微信/少数派专用查找，不再以 OCR 标题替代失败的 AI 结果 |
| `services/reverse_platforms/`、`reverse_platform_adapter.py` | 提供 11 个平台解析器和 155 站点映射；适配层按平台调用并过滤搜索页等非原文结果 |
| `services/scraper_service.py` | 兼容导出层，转出解析入口、注册表及截图帮助函数 |
| `services/screenshot_service.py` | 鉴权页识别、代理探测、无头浏览器截图与缓存 |
| `services/scrapers/__init__.py` | 对外提供 `scrape_url_metadata` 和注册表 |
| `services/scrapers/base.py` | `can_handle`/`scrape` 契约，元数据包含标题、描述、图片、图标和 URL |
| `services/scrapers/registry.py` | 按保护库→试验库→通用兜底调度；解析器自行判断 URL 是否适用 |
| `services/scrapers/fallback.py` | 已锁定的 G-001 通用基础规则；requests/BeautifulSoup 提取元数据，无封面且非鉴权页时尝试截图 |
| `services/scrapers/protected/__init__.py` | 注册六个锁定的站点例外解析器 |
| `services/scrapers/protected/bilibili.py` | P-001：B 站视频、短链及空间元数据 |
| `services/scrapers/protected/instagram.py` | P-002：Instagram Embed 元数据 |
| `services/scrapers/protected/youtube.py` | P-003：YouTube ID、oEmbed 和封面 |
| `services/scrapers/protected/pinterest.py` | P-004：Pinterest 元数据与原图路径尝试 |
| `services/scrapers/protected/x_twitter.py` | P-005：FxTwitter 元数据及 Twitterbot SSR 回退 |
| `services/scrapers/protected/shens_blog.py` | P-007：Shen’s Blog 页面的标题和封面元数据 |
| `services/scrapers/experimental/__init__.py` | 注册飞书和 Medium 试验解析器 |
| `services/scrapers/experimental/feishu.py` | E-001：飞书/Lark 文档标题识别，统一返回无封面信息卡 |
| `services/scrapers/experimental/medium.py` | E-002：读取 Medium 文章元数据；访问受阻时从 URL 生成标题并保留无封面信息卡 |
| `tests/test_protected_scrapers.py` | 保护状态、URL 匹配、注册列表等断言；线上有效性仍需真实 URL 验证 |
| `data/cards.json` | 旧版数据与独立 Git 备份快照；Windows 运行数据位于 `%LOCALAPPDATA%/InfiniteCanvasNote/data/board.sqlite3` |
| `data/assets/` | 上传图片二进制文件 |
| `data/screenshots/` | 网页截图缓存 |

## 5. 数据流与修改联动

1. **加载**：未同步的本地变更优先恢复，否则读取后端非空数据；失败或为空时读取本地缓存，再恢复已保存的 `.drop`。首次桌面启动由后端安装 EXE 同级的 `Files/Template/Template一.drop`，浏览器保留代码内示例兜底；新画板和发布空白模式使用空画布。启动时规范化树连接和圆形原点尺寸，外层 Group 保留原尺寸与收起状态；首次 `.drop` 的视口和图钉随内容恢复，后续读取各自缓存。
2. **保存**：卡片及原点拖动松手调用 `commitState`；外层 Group 操作调用 `saveStateDebounced`；立即写入带待同步标记的本地数据，400ms 防抖后异步 POST 变更对象。后端比较基础修订号，过期写入返回 409；本地副本保留并提示用户手工处理冲突。当前没有自动合并或跨设备同步。
3. **图片**：粘贴/拖入先在 IndexedDB 暂存并创建 Base64 图片卡，再异步上传，成功后换成 URL；后端断开时保留本地图片。右键 OCR 转文本；识别原链接先检查二维码和 OCR 中的明确网址/编号，未命中时调用已配置的视觉模型提取平台、标题和作者，再按站内搜索→目标域名定向搜索核验具体内容页。模型未配置或失败即停止，不以 OCR 标题代替。Instagram 无标题时用 OCR 正文作为检索词；少数派 Matrix 强特征可纠正模型误判。高可信结果自动转换，相似候选在卡片旁待用户确认。未取得链接时保留原图，结果面板和最近 20 次诊断为前端临时状态。本地写入失败时仍会尝试剥离超过 50,000 字符的 Base64 图片，加载时从 IndexedDB 补回。
4. **设置**：快捷键映射与通用偏好（滚轮缩放、小地图显示）由 `useSettings.ts` 持久化在浏览器的 `pinboard_settings_v1` 中；视口记忆 `pinboard_viewport_v1` 仅存浏览器；自定义数据存储路径由后端持久化在 `%LOCALAPPDATA%/InfiniteCanvasNote/config.json` 中；树状设置微画布（`SettingsModal.tsx`）独立管理平移与缩放视口。
5. **工作区 `.drop`**：`Ctrl+S` 或右键“保存”调用 `/api/storage/save`，`Ctrl+Shift+S` 或右键“另存”调用同一接口的原生保存窗口分支；启动空数据时由 `/api/storage/load` 读取当前 `.drop`。前端不提供 JSON 或 `.note` 导入导出入口，旧 `/api/archive/*` 仅保留兼容。
6. **字段联动**：修改前端类型时同时考虑后端模型、新建/更新、复制、持久化读写及历史快照。复制对象时重映射快照内部 `groupId`、`bundleId` 和 Group 的 `parentIds`；未复制的外层 Group 不承接新卡片。`isParsing` 为前端临时字段，后端不保存。树状关系由独立卡片的 `groupId`、Group 的 `parentIds[0]` 与成员卡片的 `bundleId` 共同确定；打组时会清除成员原有的单独上级连接，脱组时成员和下级分支改接原 Group 的上级。

## 6. 修改入口速查

| 场景 | 入口 |
| :--- | :--- |
| 平移、聚焦、视口记忆 | `useViewport.ts`、`useCanvasInteractions.ts`、`utils/canvas.ts` |
| 拖动、缩放、磁吸 | `useCardDrag.ts`、`useCardResize.ts`、`utils/snap.ts` |
| 原点连接、移动、删除/解散 | `useCanvasInteractions.ts`、`useGroups.ts`、`useCanvasActions.ts` |
| 外层 Group 打组、轮廓、收起及整组断线 | `useBundleGroups.ts`、`BundleGroupComponent.tsx`、`useCanvasInteractions.ts`、`PieDateMenu.tsx` |
| Alt/Ctrl+方向键避障对齐、装箱 | `useShortcuts.ts`、`useCanvasActions.ts`、`utils/alignment.ts`、`utils/packing.ts` |
| 正文、原标题和悬浮标题 | `components/card/`、`utils/headingUtils.ts` |
| 粘贴/拖入、图片上传和 OCR | `useClipboardPaste.ts`、`useCanvasDrop.ts`、后端 assets/parser 路由 |
| 固定视觉 token | `index.css`、`tailwind.config.js`、`DESIGN_SPEC.md` |
| 小地图与裁剪 | `MinimapNav.tsx`、`useMinimapState.ts`、`useVirtualViewport.ts`、`ParentLinkLines.tsx` |
| 原点颜色 | `utils/groupColors.ts`、`PieDateMenu.tsx`、`usePieMenuState.ts`、`MinimapNav.tsx`、`BundleGroupComponent.tsx`、`GroupComponent.tsx` |
| 保存、备份、恢复 | `utils/storage.ts`、`useCanvasInit.ts`、后端 cards/storage 模块 |
| 设置微画布与快捷键/文件/恢复/画布偏好 | `SettingsModal.tsx`、`useSettings.ts`、`components/settings/`、后端 `routes/workspaces.py` |
| `.drop` 工作区保存、存为、打开与读取 | `App.tsx`、`utils/storage.ts`、`useShortcuts.ts`、后端 `routes/settings.py`、`services/drop_file_dialog.py`；Ctrl+S 更新当前文件，Ctrl+Shift+S 使用 Windows 原生保存窗口，右键“保存”悬停展开两个动作，右键“打开”使用原生打开窗口，所选文件通过 config.json 记忆，写入采用原子替换 |
| 新建画板与首次模板 | `CanvasCommandMenu.tsx`、`App.tsx`、`desktop/app.py`、`desktop/Template/Template一.drop`、后端 `routes/settings.py`；桌面端新画板使用独立窗口和数据目录；开发时独立 Vite 动态端口代理自身后端并同步源码，浏览器端使用独立会话标签 |
| 示例文件发布与首次打开目录 | `services/template_paths.py`、`routes/settings.py`、`scripts/build_dropit_installer.py`；发布包只复制指定示例至 EXE 同级的 `Files/Template/`，首次打开默认该目录，首次保存/另存为默认 Files/Save；初次恢复视口与图钉由 `useCanvasInit.ts` 完成 |
| 浏览器内置示例兜底 | `utils/storage.ts` 中的 `INITIAL_GUIDE_CARDS`、`INITIAL_GUIDE_GROUPS`；桌面端以随包 `.drop` 为准 |
| 站点元数据 | `scrapers/registry.py`、站点模块；保护范围见台账 |

## 完整工作区暂存（2026-10-06）

- `backend/services/file_settings.py` 管理正式保存/暂存地址与策略；`atomic_files.py` 提供原子写入及工作区锁；配置 JSON 更新使用跨进程锁。默认 Files 根据开发根目录或稳定 EXE 所在目录定位，禁止使用 PyInstaller 临时解包路径。
- Files 默认包含 Template、Save、Temporary；file_directory_defaults 记录上次默认地址，应用移动后调整默认地址并复制校验恢复记录，用户自定义目录保留。旧 Files/Temp 先复制校验再切换，失败保留原设置并返回 migration_error，设置界面显示错误。发布包按白名单创建示例和空目录，保留含 Files 的旧发布目录；build_desktop.ps1 -ReleaseDir 可指定新的发布目录。
- `workspace_session.py` 在数据目录的 workspace.json 中维护活动身份；浏览器独立画板通过 board_id 请求参数及 ContextVar 切换数据目录，桌面独立画板仍使用 PINBOARD_DATA_DIR。数据目录迁移保留身份。
- `draft_store.py` 管理每个画板 snapshots/*.json 与 resources/<sha256>；`draft_resources.py` 捕获、校验、还原去重资源，恢复副本独立于正式保存后的媒体清理。恢复版本预留防止暂存当前状态时淘汰所选旧版本。
- `backend/routes/workspaces.py` 提供 GET/PATCH /api/settings/files、POST /api/settings/folder、GET /api/workspace/current、POST /api/workspace/draft、GET /api/workspace/recoveries、POST /api/workspace/reserve-recovery 和 /api/workspace/restore。完整状态统一包含 cards、groups、viewport、pins、workspace_id 和修订信息。旧存储接口保留兼容。
- `frontend/src/hooks/useWorkspaceDraft.ts` 调度防抖和最长间隔、持久化完整本地副本、刷新磁盘暂存；`utils/workspaceApi.ts` 与 `workspaceCache.ts` 负责类型、请求、画板作用域及缓存。初始化完成后才启用暂存，切换画板先排空旧同步任务。
- 设置的文件、恢复、画布三个通用分区由 generalCatalog、GeneralControls、useGeneralSettings 和 RecoveryPanel 组织，保持现有微画布组件和快捷键录制行为。
- `desktop/close_checkpoint.py` 先取消原生关闭，在线程中等待 JavaScript 的磁盘确认，再执行关闭；UI 线程不阻塞。失败保留窗口。运行时 Files 被 Git 忽略，发布包按白名单复制 EXE 和指定模板，排除用户暂存。

- 启动接口返回已应用的 draft_client_revision，前端识别自己已经成功写入的恢复副本，避免将启动续接误判为另一窗口冲突；完整工作区中的有效视口不被旧迁移/全览逻辑覆盖。发布组装遇到用户 Files 目录会保留数据并要求使用新输出目录。

- WebView2 开发与发布壳共用 close_checkpoint.py，主窗口及新画板窗口都在完成暂存后关闭，再清理自己创建的完整服务进程树；PINBOARD_APP_ROOT 始终使用项目根目录或主 EXE 所在目录，防止冻结后端残留或使用临时解包路径。
