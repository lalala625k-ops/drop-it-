# 项目说明

这是一个运行在浏览器中的无限画布便签看板，用于收集和整理文本、图片与网页链接。前端使用 React、TypeScript 和 Vite，后端使用 FastAPI。

## 主要功能

- 在画布上创建、拖动、缩放和排列卡片；用外层 Group 打包卡片，用圆形父物体关联卡片。
- 粘贴图片或链接，提取图片文字及网页标题、封面等信息。
- 提供搜索、标签、日期、右键轮盘、小地图、撤销和 JSON 备份。
- 卡片、外层 Group 与父物体数据保存到浏览器和后端；视口只保存在浏览器。

## 核心规则

- 产品行为以 `product_requirements_document.md` 为参考，视觉修改先看 `DESIGN_SPEC.md`，代码位置可查 `ARCHITECTURE.md`。
- 修改 `backend/services/scrapers/protected/`、`backend/services/scrapers/fallback.py` 或解析调度逻辑之前，必须先阅读 `image_parsing_rules.md`。没有用户针对具体规则的明确指令，不修改已锁定规则的解析逻辑；新站点规则按该文档的试验区和保护区流程处理。
- 修改卡片、外层 Group、父物体或视口状态时，检查对应的保存与恢复路径，避免刷新后丢失用户操作。
- 保持改动集中在当前任务。除非用户要求，不新增或运行测试；交付时说明未验证的部分。
