# 项目架构与文件职责地图

> **同步日期**：2026-10-02。本文说明当前工作区的结构、职责和数据流；产品行为见 `product_requirements_document.md`，视觉规则见 `DESIGN_SPEC.md`，站点保护范围见 `image_parsing_rules.md`。已知实现限制应明确记录，不能把计划能力写成已经实现。

## 1. 架构与维护原则

- 前端为 React 18 + TypeScript + Vite + Tailwind CSS；画布由 DOM 的位移/缩放实现，连线与外层 Group 轮廓使用 SVG。后端为 FastAPI，卡片、外层 Group 与圆形父物体以 JSON 全量保存。
- `components/` 负责呈现和事件绑定，部分组件仍包含局部编辑状态；跨组件业务状态与交互调度放在 `hooks/`，几何和字符串计算放在 `utils/`。
- `utils/storage.ts` 是有副作用的存储适配器，包含 LocalStorage、网络请求及文件导入导出；其他计算工具应保持纯函数，不依赖 React Hook。
- 新增模块尽量控制在 150～200 行。现有 App、交互 Hook、轮盘和正文组件等仍超过这一目标，后续修改时按职责逐步拆分。
- 新增、移动或拆分模块时同步更新本文；受保护站点遵守图片解析台账，不擅自改动锁定解析逻辑。

## 2. 根目录与运行配置

| 文件/目录 | 职责 |
| :--- | :--- |
| `product_requirements_document.md` | 当前功能、交互、存储边界、数据模型和已知限制 |
| `DESIGN_SPEC.md` | 默认视觉规则、主题色、标题字阶及实现差异 |
| `image_parsing_rules.md` | 保护库、试验库、通用解析规则及迁移流程 |
| `run_app.bat` | 启动 Vite（5173）和 Uvicorn（127.0.0.1:8000），打开浏览器 |
| `backup_database.bat` | 在 `backend/data/` 的独立 Git 仓库中暂存、按需提交、拉取并推送 `origin/main`；需要预先配置数据仓库和远程访问 |
| `.gitignore` | 忽略依赖、构建输出、Python 缓存及独立管理的 `backend/data/` |
| `.agents/`、`skills/` | 项目工作流技能与参考材料，包括代码精简技能 |
| `frontend/package.json` | 依赖；`dev`、`build`（tsc + Vite）、`preview` 命令 |
| `frontend/vite.config.ts` | 5173 开发端口；`/api` 代理到后端 8000；单独启动 Vite 时尝试启动缺失的本地后端 |
| `frontend/tsconfig.json` | TypeScript 编译配置 |
| `frontend/tailwind.config.js` | 颜色、字体、字距和圆角 token |
| `frontend/postcss.config.js` | Tailwind 与 Autoprefixer 插件配置 |
| `frontend/index.html` | 挂载节点、初始底色及 Google Fonts Inter 400/700 字重加载 |

## 3. 前端文件职责（`frontend/src/`）

### 3.1 入口、类型与常量

- `main.tsx`：React 挂载入口、StrictMode 和全局样式导入。
- `App.tsx`：组织各 Hook、DOM 画布层、SVG 连线、卡片、父物体和弹窗；在捕获阶段将对象上的画布导航手势交给画布，并按鼠标按下状态控制选中框显示；空白右键按下打开画布命令饼菜单。
- `index.css`：默认浅色主题、无网格画布、字体和 3px 滚动条。
- `types/index.ts`：定义 `CardType`、`Card`、`Group`、`Viewport`、`Rect`、`SnapLine`、`HistoryState`。视口使用 `x/y/zoom`；`Card.groupId` 指向树中的唯一父节点（卡片、外层 Group 或圆形父物体），`Card.bundleId` 表示外层 Group 成员。`Group.parentIds` 为兼容旧数据保留数组字段，但只使用一项。`Group.kind` 区分两类节点，旧数据无 kind 时视为父物体。

### 3.2 工具层（`utils/`）

| 文件 | 职责 |
| :--- | :--- |
| `canvas.ts` | 屏幕/世界坐标转换、矩形相交、包围盒、全览与单卡聚焦视口计算 |
| `snap.ts` | 卡片拖动磁吸偏移及水平/垂直辅助线计算；当前由单卡拖动路径调用 |
| `alignment.ts` | 卡片和圆形父物体的上下左右对齐，按外接矩形处理固定障碍物和已就位对象，默认 5px 间距；选中的外层 Group 在 `useCanvasActions.ts` 中展开为成员卡片 |
| `packing.ts` | 卡片自动装箱排版，返回 ID 到位置的映射 |
| `dateParser.ts` | 日期、时间和自然语言输入解析与格式化 |
| `headingUtils.ts` | 解析标题的 `# `、`## ` 前缀，更多井号映射为二级，返回级别、原文和去前缀文本 |
| `cardBounds.ts` | 统一计算卡片本体加悬浮标题的逻辑边界，供框选、碰撞、避让、对齐、装箱和视口使用 |
| `textCardSize.ts` | 以默认 15px 字号测量文本宽度并估算换行，为新建和外部粘贴的文本卡片确定紧凑宽高 |
| `cardDefaultSize.ts` | 记录与推断卡片默认尺寸；组外卡片复位时保持中心位置，旧数据按内容或类型回退 |
| `feishu.ts` | 识别飞书/Lark 域名并提供飞书图标地址；前端将飞书网页卡统一按无封面显示 |
| `tagUtils.ts` | 统计已有标签频率，生成高频列表，不足时补入建议标签 |
| `groupRelations.ts` | 统一树节点的父子关系、后代遍历、环检测与旧多父连接规范化；外层 Group 的成员视为该 Group 的下级 |
| `linkEndpoints.ts` | 按卡片矩形、父物体圆形和 Group 展开/收起轮廓，计算两对象边界最近的连线端点与交互引线起点 |
| `treeTargets.ts` | Ctrl+Shift 引线连接时查找卡片、外层 Group、圆形父物体目标与中心点 |
| `groupColors.ts` | 四个渐变节点、连续取色插值及文字对比色计算 |
| `pieMenuGeometry.ts` | 对象与空白画布菜单共用的边缘定位、钟面坐标、右键划动阈值和方向扇区命中 |
| `storage.ts` | 引导卡片、立即写入带待同步标记的 LocalStorage、400ms 防抖及顺序后端同步、刷新恢复、JSON 导入导出 |
| `pendingImages.ts` | 在 IndexedDB 按卡片 ID 暂存原始图片，刷新时恢复因 LocalStorage 容量限制剥离的 Base64 图片 |
| `ingestScreenshot.ts` | 粘贴/拖入图片时立即建卡并暂存原图，异步上传成功后换成持久资源地址；原图等待用户从右键菜单选择识别方式 |
| `recognizeCardImage.ts` | 图片卡右键 OCR/原链接识别请求及转换字段；原链接未命中时保留图片 |

### 3.3 状态与交互层（`hooks/`）

| 文件 | 职责 |
| :--- | :--- |
| `useViewport.ts` | 视口和光标坐标、每档上滚 1.12 倍/下滚 0.88 倍的指针锚定缩放、单卡聚焦/还原、全览；以 `pinboard_viewport_v1`、200ms 防抖记忆视口 |
| `useVirtualViewport.ts` | 未收起卡片超过 40 张或 Group/父物体超过 10 个时裁剪离屏对象；300 屏幕像素缓冲，选中对象和选中父物体的关联对象始终保留；返回可见卡片 ID 供连线裁剪 |
| `useCanvasInteractions.ts` | 鼠标手势状态机：平移、Alt+中键指针锚定连续缩放、框选、拖动、Ctrl+Shift 引线连接或单击断开、卡片缩放、轮盘；卡片与外层 Group 可连到卡片、Group 或圆形父物体，拒绝成环；普通拖动带动自身后代，Ctrl 拖动只移动当前对象（Group 含成员） |
| `useCanvasActions.ts` | 新建、更新、删除、解散、编组、撤销、装箱、方向对齐、组外卡片恢复默认尺寸及全部卡片按平均宽度统一宽度；选中外层 Group 时展开成员卡片参与对齐，重算并保存组边界；`commitState` 更新卡片/父物体并排队保存 |
| `useCanvasInit.ts` | 加载时把旧多父关系收敛为单父树，修正 Group 成员的文字缩放比例，保持旧父物体中心并统一尺寸为 120px；恢复视口或全览；注册关闭前刷新 |
| `useCanvasDrop.ts` | 处理首个拖入图片文件、JSON 备份，或将外部图片 URL、网页链接和文本交给共用摄入流程 |
| `useSelection.ts` | 卡片、外层 Group 与父物体选中集合、Shift 选择、清空及矩形相交框选；Group 命中时避免重复框选内部成员 |
| `useCardDrag.ts` | 拖动初始坐标与位移、单卡 Shift+Space 磁吸及连接目标检测；普通拖动联动下级分支、Ctrl/Cmd 仅移动当前对象由 `useCanvasInteractions.ts` 处理 |
| `useBundleGroups.ts` | 外层 Group 的无名无色创建、包含成员悬浮标题的凸包轮廓与动态边界、收起/展开、整体拖动与四角等比缩放；所有成员内容随组缩放，恢复默认大小按组中心复位所有成员；拖动卡片松手时按中心点由外跨入轮廓/收起列表判断入组；指定父物体的整组断线及解散；变更走历史与防抖保存 |
| `useCardResize.ts` | 八向缩放、Ctrl+Alt 水平拖动等比缩放及尺寸限制；保留父物体缩放辅助接口 |
| `useClipboardPaste.ts` | 内部对象 JSON 暂存并等待鼠标单击；外部图片、图片 URL、网页链接和文本立即创建；拖入的数据也走同一识别流程，图片文件调用共用截图摄入函数 |
| `useCardClipboard.ts` | 复制选中的卡片、父物体、外层 Group 及其有效成员；暂存跟随鼠标的粘贴快照，单击后按整体中心放置并重建 ID、内部连线与成员关系；Ctrl+D 仍直接克隆选中卡片 |
| `canvasClipboard.ts` | 收集复制对象、计算整体包围盒与中心、克隆时重映射 `groupId` 和 `bundleId` |
| `ClipboardPastePreview.tsx` | 粘贴确认前显示跟随鼠标的卡片、父物体、Group 和连线轮廓 |
| `useGroups.ts` | 父物体状态、命名、新建和绑定；默认 120px 与四色循环默认色；空父物体新建执行有限次数的 5px 避障；`refreshGroupBounds` 保持独立节点边界 |
| `useHistory.ts` | 最多 30 份卡片/父物体深拷贝快照，提供 `pushHistory` 和 `undo`，当前没有 redo |
| `useShortcuts.ts` | 新建、删除、撤销、编组/解散、Alt/Ctrl+方向键对齐、复制、搜索、备份和粘贴监听；M 键及失焦控制小地图 |
| `useMinimapState.ts` | M 键控制常驻小地图的大图模式，几何映射在 `MinimapNav.tsx` |
| `usePieMenuState.ts` | 以卡片、外层 Group、父物体的显式目标类型记录当前轮盘；处理日期/标题/标签及父物体颜色、图片识别、网页重新解析、历史与保存 |

### 3.4 组件层（`components/`）

| 文件 | 职责 |
| :--- | :--- |
| `CardComponent.tsx` | memo 卡片容器、坐标/尺寸/层级、加粗边框、链接点击保护、300ms 描述提示和子组件组装；组内卡片屏幕较短边不大于 20px 时显示简化缩略图 |
| `card/CardBodyContent.tsx` | 图片/网页/纯文本渲染；文字卡选中后可直接编辑和选择正文，失焦清除并重建文本框以移除残留选区，按组缩放比例调整未锁定卡片尺寸；网页原标题编辑、封面比例调高；飞书网页卡隐藏封面并显示图标 |
| `FeishuLogo.tsx` | 飞书网页卡标题和收起 Group 列表使用的图标，远程图标失效时回退到文字标记 |
| `card/CardHeaderBadges.tsx` | 日期徽标；标签由正文分支绘制 |
| `card/CardResizeHandles.tsx` | 八向缩放手柄和方向类型 |
| `card/FloatingHeaderTitle.tsx` | 独立悬浮标题、两级显示、就地编辑保存；24px/900 或 18px/700 |
| `GroupComponent.tsx` | 120px 圆形父物体、选中仍保留组色并加深轮廓、圆内名称和关联数量、圆内名称编辑及保留子卡片的解散按钮 |
| `BundleGroupComponent.tsx` | 外层 Group 凸包多边形虚线轮廓与组色淡填充、最近凸包顶点上的四个缩放点、透明底悬浮名称、轮廓外左上方的方形收起/展开按钮、收起态成员列表及网站图标、右键饼菜单入口 |
| `MinimapNav.tsx` | 左下角常驻小地图与居中的 M 键大图、世界范围/比例、卡片/圆形父物体缩略图及展开 Group 的凸包色区；组内卡片不绘制，Group 与独立卡片优先继承所连父物体颜色，无色时为黑色；单击 100% 居中和拖框适配视口 |
| `ParentLinkLines.tsx` | 树中任意上级节点到卡片或 Group 的 SVG 连线；两端都落在对象边界的最近点，选中节点会加粗其后代分支 |
| `SnapGuides.tsx` | 拖动磁吸的水平/垂直辅助虚线 |
| `SelectionBox.tsx` | 框选矩形 |
| `CanvasCommandMenu.tsx` | 空白处右键按下立即打开原有八项方位的命令饼菜单，按钮使用两个汉字的短标签；与对象菜单共用扇区手势、边缘定位与取消规则 |
| `GradientColorArc.tsx` | 将黄、粉、蓝、白渐变绘成左侧 64 档半圆环，悬停显示白色主环与凸出的当前色扇形，按点击或拖动位置取色并提交 |
| `CanvasModals.tsx` | 聚合对象轮盘、焦点蒙版、搜索及小地图；解析显式菜单目标并按对象能力连接操作 |
| `PieMenuFocusOverlay.tsx` | 对象轮盘打开时覆盖搜索弹窗的 Ink/30 模糊蒙版，并把当前对象的 DOM 快照原位显示在蒙版上方；外层 Group 同时保留可见的组内卡片 |
| `SearchModal.tsx` | 卡片字段的大小写不敏感子串过滤；输入后显示单行便签结果；键盘选择和聚焦 |
| `PieDateMenu.tsx` | 按显式对象类型筛选固定钟面槽位；统一显示两个汉字的短标签（NOW 除外），完整动作由悬停说明表达；原始图片也有通用整理入口，父物体左内圈保留 180° 色环；右键划向有效扇区或左键点击执行 |
| `PieDateInputModal.tsx` | 日期输入、解析校验、保存和清除 |
| `PieTagModal.tsx` | 标签检索、新标签输入和勾选切换 |
| `PieTitleInputModal.tsx` | 悬浮标题输入/清除，保留 Markdown 字符并提示原标题 |

## 4. 后端文件职责（`backend/`）

| 文件/目录 | 职责 |
| :--- | :--- |
| `main.py` | FastAPI/CORS、三个路由模块及 `/api/assets`、`/api/screenshots` 静态目录 |
| `routes/cards.py` | CardModel、GroupModel、PersistencePayload；GET 全量读取，POST 全量替换保存 |
| `routes/assets.py` | POST `/api/upload-asset`；Base64 解码，取 SHA256 前 16 个十六进制字符命名去重，返回静态 URL |
| `routes/parser.py` | POST `/api/recognize-image` 和 `/api/resolve-image` 支持上传文件、Base64 JSON、原始请求体；GET `/api/fetch-metadata` |
| `services/storage.py` | 读写 `cards.json`，兼容旧数组格式；写 `.tmp` 后 `os.replace` |
| `services/ocr_service.py` | RapidOCR 初始化、Pillow 预处理、首行标题和全文；不可用或出错时返回失败结果 |
| `services/screenshot_link_service.py` | 从 OCR 文本提取 B 站/X 直接链接或 BV 号，并保守校验网页搜索结果 |
| `services/bilibili_reverse_service.py` | 按 OCR 坐标分别提取电脑端截图和手机竖屏截图的标题、UP 主及可见时长；通过 B 站视频搜索、综合搜索回退、失败页重试和进程内已核实结果缓存查找候选，再按标题/作者/时长评分；与受保护的正向解析器独立 |
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
| `services/scrapers/experimental/__init__.py` | 注册飞书试验解析器 |
| `services/scrapers/experimental/feishu.py` | E-001：飞书/Lark 文档标题识别，统一返回无封面信息卡 |
| `tests/test_protected_scrapers.py` | 保护状态、URL 匹配、注册列表等断言；线上有效性仍需真实 URL 验证 |
| `data/cards.json` | 卡片和父物体全量数据 |
| `data/assets/` | 上传图片二进制文件 |
| `data/screenshots/` | 网页截图缓存 |

## 5. 数据流与修改联动

1. **加载**：未同步的本地变更优先恢复，否则读取后端非空数据；失败或为空时读取本地缓存，再降级到引导卡片。启动时规范化树连接和圆形父物体尺寸，外层 Group 保留原尺寸与收起状态；视口单独恢复。
2. **保存**：卡片及父物体拖动松手调用 `commitState`；外层 Group 操作调用 `saveStateDebounced`；立即写入带待同步标记的本地数据，400ms 防抖后异步 POST 全量数据。关闭前调用 `flushStoredCards` 并尝试 beacon。父物体双击就地重命名仍缺少独立保存调用；后端全量保存错误当前静默处理，没有版本冲突合并或可靠重试队列。
3. **图片**：粘贴/拖入先在 IndexedDB 暂存并创建 Base64 图片卡，再异步上传，成功后换成 URL；后端断开时保留本地图片。图片右键菜单选择 OCR 时转文本；选择恢复 B 站/X 原链接时，命中则转网页卡，未命中则保留原图并提示。本地写入失败时仍会尝试剥离超过 50,000 字符的 Base64 图片，加载时从 IndexedDB 补回。
4. **设置**：`pinboard_viewport_v1` 仅存浏览器，不包含在后端数据及 JSON 导出中。画布和主画布卡片使用固定配色；Group/父物体的 `color` 随 `groups` 写入本地、后端和 JSON 备份，旧卡片颜色字段保留兼容但不参与主画布卡片绘制。
5. **备份**：JSON 导出 `{cards, groups}`，保留现有 `image` 值（URL 或 Base64），不打包 URL 指向文件。迁移须另带 `assets/`、`screenshots/`；远程图片仍依赖原站。
6. **字段联动**：修改前端类型时同时考虑后端模型、新建/更新、复制、导入导出及历史快照。复制对象时重映射快照内部 `groupId`、`bundleId` 和 Group 的 `parentIds`；未复制的外层 Group 不承接新卡片。`isParsing` 为前端临时字段，后端不保存。树状关系由独立卡片的 `groupId`、Group 的 `parentIds[0]` 与成员卡片的 `bundleId` 共同确定；打组时会清除成员原有的单独上级连接，脱组时成员和下级分支改接原 Group 的上级。

## 6. 修改入口速查

| 场景 | 入口 |
| :--- | :--- |
| 平移、聚焦、视口记忆 | `useViewport.ts`、`useCanvasInteractions.ts`、`utils/canvas.ts` |
| 拖动、缩放、磁吸 | `useCardDrag.ts`、`useCardResize.ts`、`utils/snap.ts` |
| 父物体连接、移动、删除/解散 | `useCanvasInteractions.ts`、`useGroups.ts`、`useCanvasActions.ts` |
| 外层 Group 打组、轮廓、收起及整组断线 | `useBundleGroups.ts`、`BundleGroupComponent.tsx`、`useCanvasInteractions.ts`、`PieDateMenu.tsx` |
| Alt/Ctrl+方向键避障对齐、装箱 | `useShortcuts.ts`、`useCanvasActions.ts`、`utils/alignment.ts`、`utils/packing.ts` |
| 正文、原标题和悬浮标题 | `components/card/`、`utils/headingUtils.ts` |
| 粘贴/拖入、图片上传和 OCR | `useClipboardPaste.ts`、`useCanvasDrop.ts`、后端 assets/parser 路由 |
| 固定视觉 token | `index.css`、`tailwind.config.js`、`DESIGN_SPEC.md` |
| 小地图与裁剪 | `MinimapNav.tsx`、`useMinimapState.ts`、`useVirtualViewport.ts`、`ParentLinkLines.tsx` |
| 父物体颜色 | `utils/groupColors.ts`、`PieDateMenu.tsx`、`usePieMenuState.ts`、`MinimapNav.tsx`、`BundleGroupComponent.tsx`、`GroupComponent.tsx` |
| 保存、备份、恢复 | `utils/storage.ts`、`useCanvasInit.ts`、后端 cards/storage 模块 |
| 站点元数据 | `scrapers/registry.py`、站点模块；保护范围见台账 |
