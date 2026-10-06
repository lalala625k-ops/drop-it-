# 项目说明

这是一个运行在浏览器中的无限画布便签看板，用于收集和整理文本、图片与网页链接。前端使用 React、TypeScript 和 Vite，后端使用 FastAPI。


## 核心规则

- 产品行为以 `product_requirements_document.md` 为参考，视觉修改先看 `DESIGN_SPEC.md`，代码位置可查 `ARCHITECTURE.md`。
- 修改 `backend/services/scrapers/protected/`、`backend/services/scrapers/fallback.py` 或解析调度逻辑之前，必须先阅读 `image_parsing_rules.md`。没有用户针对具体规则的明确指令，不修改已锁定规则的解析逻辑；新站点规则按该文档的试验区和保护区流程处理。
- 修改卡片、外层 Group、原点或视口状态时，检查对应的保存与恢复路径，避免刷新后丢失用户操作。

## 本地敏感配置

- 文件名以 `.local.json` 或 `.local.csv` 结尾的文件视为仅供本机使用的敏感配置；API Key 等凭据应采用这类命名，并由 `.gitignore` 按文件名排除。当前图片溯源配置属于此类。
- 只有用户明确要求配置、排查相关服务或调用该服务时，才读取所需的本地敏感配置；平时不主动打开、修改、迁移或上传这些文件。
- 排查时只核对必要的字段名、是否已配置及非敏感状态，不在工具输出、日志或答复中展示密钥值。修改配置须有用户明确指令。
- `.gitignore` 只阻止正常 Git 纳入这些文件，不会加密文件，也不能阻止手动上传；上传或分享前仍须检查目标文件。
