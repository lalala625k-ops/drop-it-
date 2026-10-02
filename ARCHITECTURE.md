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
| `frontend/vite.config.ts` | 5173 开发端口；`/api` 代理到后端 8000 |
| `frontend/tsconfig.json` | TypeScript 编译配置 |
| `frontend/tailwind.config.js` | 颜色、字体、字距和圆角 token |
| `frontend/postcss.config.js` | Tailwind 与 Autoprefixer 插件配置 |
| `frontend/index.html` | 挂载节点、初始底色及 Google Fonts Inter 400/700 字重加载 |

## 3. 前端文件职责（`frontend/src/`）

### 3.1 入口、类型与常量

- `main.tsx`：React 挂载入口、StrictMode 和全局样式导入。
- `App.tsx`：组织各 Hook、DOM 画布层、SVG 连线、卡片、父物体和弹窗；在捕获阶段将对象上的画布导航手势交给画布，并按鼠标按下状态控制选中框显示；空白右键点击打开画布命令饼菜单，右键拖动平移画布。
- `index.css`：默认浅色主题、无网格画布、字体和 3px 滚动条。
- `types/index.ts`：定义 `CardType`、`Card`、`Group`、`Viewport`、`Rect`、`SnapLine`、`HistoryState`。视口使用 `x/y/zoom`；`Card.groupId` 表示圆形父物体连线，`Card.bundleId` 表示外层 Group 成员。`Group.kind` 区分两类节点，旧数据无 kind 时视为父物体。选区由 Hook 内的 ID 集合维护。

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
| `tagUtils.ts` | 统计已有标签频率，生成高频列表，不足时补入建议标签 |
| `groupRelations.ts` | 计算父物体的有效关联卡片与外层 Group；组内任一成员直连时整组参与联动，成员原始 `groupId` 保留供脱组恢复 |
| `groupColors.ts` | 六等分色相的基础色、同色系变体及文字对比色计算 |
| `storage.ts` | 引导卡片、LocalStorage 容错、400ms 防抖保存、后端同步、关闭前刷新及 JSON 导入导出 |
| `ingestScreenshot.ts` | 粘贴/拖入图片时创建图片卡片并异步上传，保留原图等待用户从右键菜单选择识别方式 |
| `recognizeCardImage.ts` | 图片卡右键 OCR/原链接识别请求及转换字段；原链接未命中时保留图片 |

### 3.3 状态与交互层（`hooks/`）

| 文件 | 职责 |
| :--- | :--- |
| `useViewport.ts` | 视口和光标坐标、每档上滚 1.12 倍/下滚 0.88 倍的指针锚定缩放、单卡聚焦/还原、全览；以 `pinboard_viewport_v1`、200ms 防抖记忆视口 |
| `useVirtualViewport.ts` | 未收起卡片超过 40 张或 Group/父物体超过 10 个时裁剪离屏对象；300 屏幕像素缓冲，选中对象始终保留；返回可见卡片 ID 供连线裁剪 |
| `useCanvasInteractions.ts` | 鼠标手势状态机：平移、Alt+中键指针锚定连续缩放、框选、拖动、Ctrl 引线连接、卡片缩放、轮盘；组内卡片断线按同一 Group 与同一父物体批量处理；卡片及父物体拖动松手时调用 `commitState` 保存 |
| `useCanvasActions.ts` | 新建、更新、删除、解散、编组、撤销、装箱、方向对齐；选中外层 Group 时展开成员卡片参与对齐，重算并保存组边界；`commitState` 更新卡片/父物体并排队保存 |
| `useCanvasInit.ts` | 加载数据，保持旧父物体中心并统一尺寸为 120px；恢复视口或全览；注册关闭前刷新 |
| `useCanvasDrop.ts` | 处理首个拖入文件：JSON 备份替换卡片/父物体，或调用截图识别流程 |
| `useSelection.ts` | 卡片、外层 Group 与父物体选中集合、Shift 选择、清空及矩形相交框选；Group 命中时避免重复框选内部成员 |
| `useCardDrag.ts` | 拖动初始坐标与位移、单卡 Shift+Space 磁吸、父物体普通/联动移动及连接目标检测 |
| `useBundleGroups.ts` | 外层 Group 的无名创建与六色循环默认色、包含成员悬浮标题的凸包轮廓与动态边界、收起/展开、整体拖动与四角等比缩放；拖动卡片松手时按中心点由外跨入轮廓/收起列表判断入组；指定父物体的整组断线及解散；变更走历史与防抖保存 |
| `useCardResize.ts` | 八向缩放、Ctrl+Alt 水平拖动等比缩放及尺寸限制；保留父物体缩放辅助接口 |
| `useClipboardPaste.ts` | 内部卡片 JSON、图片、URL、纯文本识别，HTML 仅提取链接；图片调用共用截图识别流程 |
| `useCardClipboard.ts` | 内存/系统剪贴板复制；光标处粘贴或 Ctrl+D 克隆，保持相对位置，重建 ID/层级并清除 `groupId` 和 `bundleId` |
| `useGroups.ts` | 父物体状态、命名、新建和绑定；默认 120px 与六色循环默认色；空父物体新建执行有限次数的 5px 避障；`refreshGroupBounds` 保持独立节点边界 |
| `useHistory.ts` | 最多 30 份卡片/父物体深拷贝快照，提供 `pushHistory` 和 `undo`，当前没有 redo |
| `useShortcuts.ts` | 新建、删除、撤销、编组/解散、Alt/Ctrl+方向键对齐、复制、搜索、备份和粘贴监听；M 键及失焦控制小地图 |
| `useMinimapState.ts` | M 键控制常驻小地图的大图模式，几何映射在 `MinimapNav.tsx` |
| `usePieMenuState.ts` | 卡片与 Group 共用轮盘，处理日期/标题/标签及 Group/父物体颜色；图片 OCR/原链接识别、网页重新解析、历史与保存 |

### 3.4 组件层（`components/`）

| 文件 | 职责 |
| :--- | :--- |
| `CardComponent.tsx` | memo 卡片容器、坐标/尺寸/层级、加粗边框、链接点击保护、300ms 描述提示和子组件组装；组内卡片屏幕较短边不大于 20px 时显示简化缩略图 |
| `card/CardBodyContent.tsx` | 图片/网页/纯文本渲染；文本及网页原标题编辑、封面比例调高；当前图片分支显示 OCR 首行但不展示全文 |
| `card/CardHeaderBadges.tsx` | 日期徽标；标签由正文分支绘制 |
| `card/CardResizeHandles.tsx` | 八向缩放手柄和方向类型 |
| `card/FloatingHeaderTitle.tsx` | 独立悬浮标题、两级显示、就地编辑保存；24px/900 或 18px/700 |
| `GroupComponent.tsx` | 120px 圆形父物体、未选中态组色、关联数量、名称编辑及保留子卡片的解散按钮 |
| `BundleGroupComponent.tsx` | 外层 Group 凸包多边形虚线轮廓与组色淡填充、最近凸包顶点上的四个缩放点、透明底悬浮名称、轮廓外左上方的方形收起/展开按钮、收起态成员列表及网站图标、右键饼菜单入口 |
| `MinimapNav.tsx` | 左下角常驻小地图与居中的 M 键大图、世界范围/比例、卡片/圆形父物体缩略图及展开 Group 的凸包色区；组内卡片优先继承关联父物体颜色；单击 100% 居中和拖框适配视口 |
| `ParentLinkLines.tsx` | 父物体到独立卡片或 Group 的 SVG 连线；Group 内同一父物体的多条线合并为一条，从父物体中心连到 Group 展开轮廓/收起列表的边缘；静置色和线宽按成员数由 1px Ash 渐变至 2px Ink，10 张封顶，连线整体为 80% 不透明度 |
| `SnapGuides.tsx` | 拖动磁吸的水平/垂直辅助虚线 |
| `SelectionBox.tsx` | 框选矩形 |
| `CanvasCommandMenu.tsx` | 空白处右键命令饼菜单，承载新建、Group、搜索、复制、粘贴及全览 |
| `CanvasModals.tsx` | 聚合对象轮盘、搜索及小地图；Group 右键复用卡片饼菜单并可设置颜色 |
| `SearchModal.tsx` | 卡片字段的大小写不敏感子串过滤；输入后显示单行便签结果；键盘选择和聚焦 |
| `PieDateMenu.tsx` | 按文字/网页卡、原始图片、外层 Group 与圆形父物体选择不同的紧凑圆形按钮布局；Group/父物体颜色入口含六色轮盘和右键细分轮盘；组内卡片可脱离 Group，连接父物体的卡片可断线；支持滑向松手或点击 |
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
| `services/scrapers/experimental/feishu.py` | E-001：飞书/Lark 文档识别；首页头图仍待修复 |
| `tests/test_protected_scrapers.py` | 保护状态、URL 匹配、注册列表等断言；线上有效性仍需真实 URL 验证 |
| `data/cards.json` | 卡片和父物体全量数据 |
| `data/assets/` | 上传图片二进制文件 |
| `data/screenshots/` | 网页截图缓存 |

## 5. 数据流与修改联动

1. **加载**：后端非空数据优先，失败或为空时读取非空本地缓存，再降级到引导卡片。启动时只规范化圆形父物体尺寸，外层 Group 保留原尺寸与收起状态；视口单独恢复。
2. **保存**：卡片及父物体拖动松手调用 `commitState`；外层 Group 操作调用 `saveStateDebounced`；400ms 后写本地并异步 POST 全量数据。关闭前调用 `flushStoredCards` 并尝试 beacon。父物体重命名仍缺少独立保存调用；后端错误当前静默处理，没有版本冲突合并或可靠重试队列。
3. **图片**：粘贴/拖入先创建 Base64 图片卡并异步上传，成功后换成 URL。图片右键菜单选择 OCR 时转文本；选择恢复 B 站/X 原链接时，命中则转网页卡，未命中则保留原图并提示。本地写入失败时仍会尝试剥离超过 50,000 字符的 Base64 图片。
4. **设置**：`pinboard_viewport_v1` 仅存浏览器，不包含在后端数据及 JSON 导出中。画布和主画布卡片使用固定配色；Group/父物体的 `color` 随 `groups` 写入本地、后端和 JSON 备份，旧卡片颜色字段保留兼容但不参与主画布卡片绘制。
5. **备份**：JSON 导出 `{cards, groups}`，保留现有 `image` 值（URL 或 Base64），不打包 URL 指向文件。迁移须另带 `assets/`、`screenshots/`；远程图片仍依赖原站。
6. **字段联动**：修改前端类型时同时考虑后端模型、新建/更新、复制、导入导出及历史快照。复制卡片时清除 `groupId` 与 `bundleId`；`isParsing` 为前端临时字段，后端不保存。父物体与外层 Group 的有效关联在运行时由卡片原始 `groupId` 和 `bundleId` 计算，不额外写入成员连接状态；脱组保留原始直连状态。

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
| Group/父物体颜色 | `utils/groupColors.ts`、`PieDateMenu.tsx`、`usePieMenuState.ts`、`MinimapNav.tsx`、`BundleGroupComponent.tsx`、`GroupComponent.tsx` |
| 保存、备份、恢复 | `utils/storage.ts`、`useCanvasInit.ts`、后端 cards/storage 模块 |
| 站点元数据 | `scrapers/registry.py`、站点模块；保护范围见台账 |
