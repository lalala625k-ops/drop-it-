# 本地文件来源路径可行性实测

## 2026-10-11 源码接入状态

文件来源已进入桌面壳与正式前端：截图粘贴可查询原生来源记录，命中后生成文件卡；支持点击打开原位置文件、手动关联/更换/移除、撤销、OCR 来源保留、复制克隆和工作区持久化。原文档不进入 `.drop`。

自动监听范围为微信默认 Alt+A；适配候选是 Photoshop 2024、WPS PDF、WPS 演示。核验来源窗口、遮挡、选区、原屏幕像素、剪贴板序号、RGB 指纹和最多 5 分钟有效期。多个可见 Photoshop/PDF 窗口会拒绝全局对象匹配；不创建软件实例。证据不足或超时时保留普通图片，允许手动关联。

本次验证包括前端构建、文件摄入/来源工具测试、剪贴板及轮盘测试、21 项桌面测试、81 项后端测试，以及独立 WebView2 的原生桥接就绪检查。数据测试核对 SQLite、暂存与实际 `.drop` 导出保留路径/缩略图，且原文档字节不进入归档。

独立 Edge 浏览器加载正式构建并连接隔离 FastAPI 后端，验证图片 paste → 上传 → 文件卡、先选中再打开路径、封面不跳转、按住右键更换/移除来源且松手关闭、一次 Ctrl+Z 恢复来源，以及保存后刷新恢复。此项使用合成 paste 图片和模拟原生来源/打开/选择器返回值；真实渲染、交互、撤销和后端读写运行于产品代码，不代表操作系统截图或文件选择器的实机验收。测试中修复了创建函数漏传 fileSource 及自动高度更新占用撤销的问题。

本次 Windows 窗口截图工具返回 `FrameArrived timed out` / `window capture timed out`，无法完成新的实机鼠标框选复验。因此不能把本次自动化数据与界面测试称为新的微信/QQ 全流程实测。下方 2026-10-09 的三个有效微信样本仍是受控原型证据；PS 兼容弹窗的历史限制仍然有效。QQ、微软 PowerPoint、其他 PDF 阅读器、其他快捷键与标注截图尚未认证。

升级源码后须重启桌面壳；旧 Releases 安装包尚不包含这次源码更新。

## 2026-10-09 历史测试记录

下述“当前”“尚未实现”均指 2026-10-09 的产品和独立原型状态，保留原始证据边界。

> 日期：2026-10-09。范围：本机 Windows、已保存的本地样本。
> 结论：本机真实微信截图与隔离 Drop-It 前端粘贴已测试。独立后台原型在 PSD、PDF、PPTX 三个受控样本中匹配到截图时的原文件，即使粘贴前切换到另一份同名文档也能匹配。
> 当前 Drop-It 仍只生成普通图片卡；来源关联没有接入产品。QQ 未测试，PS 复测出现剪贴板兼容弹窗，不能承诺稳定支持所有截图场景。

## 0. 实测范围与结论

用户已明确实际流程：使用微信或 QQ 在其他软件里截图，再把截图粘贴到 Drop-It，期望自动带上被截图文档的链接。

第一轮 15 项测试只核对文档接口返回的完整路径。这一轮另行使用真实微信截图组件，测试截图、剪贴板、来源记录与真实 Ctrl+V 粘贴。两轮结果不能混为同一组完整功能验收。

现有 `useClipboardPaste.ts` 从粘贴数据中提取图片并调用 `ingestScreenshot`，没有截图时的来源记录或图片与文件的关联机制。

普通截图通常以像素数据传递。不能把图片自身的临时文件路径误当作 PSD/PDF/PPTX 路径；也不能在用户已经切回 Drop-It 时，把当时前台窗口或软件当前文档当作截图来源。

本轮微信 3.9.12.55 的截图剪贴板只有 `CF_BITMAP`、`CF_DIB`、`CF_DIBV5`，没有原文档路径字段或自定义来源格式。浏览器真实 paste 事件收到 `image/png`，`isTrusted: true`。`GetClipboardOwner()` 本次返回 NULL，也不能用于识别被截图文档。

因此，微信截图本身不能给 Drop-It 提供 PSD/PDF/PPTX 路径。技术路线是让桌面后台在截图开始时记录真实文档路径，在截图完成时绑定图像身份，再于粘贴时查询记录。

| 验证层级 | 当前结果 |
| --- | --- |
| 来源接口能否读取完整路径 | 第一轮 15 项核对通过 |
| 微信是否直接携带原文件路径 | 本次三个截图样本均没有 |
| 截图 A、切换 B 后，原型能否仍匹配 A | PSD、WPS PDF、WPS 演示各一个有效样本通过 |
| 现有前端粘贴后的行为 | 生成普通 `image` 卡；`hasUrl: false`、`hasFileSource: false` |
| 来源卡片、点击打开、保存恢复 | 尚未实现或验收 |
| QQ、微软 PowerPoint、其他 PDF 阅读器 | 尚未实测 |

## 1. 第一轮：文档路径接口核对

| 场景 | 本次实际软件 | 可用方案 | 路径核对 |
| --- | --- | --- | --- |
| PS 源文件 | Photoshop 2024，25.0.0 | COM → `ActiveDocument.FullName` | 7/7 通过 |
| PDF | WPS PDF，12.1.0.28505 | 连接运行中的 `KPDF.Application` → `ActiveDocument.FullName` | 4/4 通过 |
| PPTX | WPS 演示，12.1.0.28505 安装目录 | 文档窗口 → `AccessibleObjectFromWindow` → `Application.ActivePresentation.FullName` | 4/4 通过 |

15 项是本次固定样本的路径对照结果，不代表对任意软件、所有版本或所有窗口场景的覆盖率。

## 2. 测试方法与证据

### 2.1 真实微信截图与粘贴

三个受控流程分别使用 Photoshop 2024、WPS PDF、WPS 演示。PDF/PPTX 的 A、B 样本放在不同目录，文件名相同，内容分别为蓝色和棕色，截图内容没有完整文件路径。

1. 在对应软件打开临时文档 A，核对其真实完整路径。
2. 独立后台原型用低级键盘钩子被动观察默认 `Alt+A`，记录微信接管前台前的窗口句柄，调用该软件的文档接口。钩子不拦截按键、不抢占截图快捷键，也不记录其他按键。
3. 测试脚本模拟按键，启动真实微信 `SnapshotWnd` 覆盖层，框选区域并完成截图；没有向聊天发送消息。
4. 原型监听 `WM_CLIPBOARDUPDATE`，将规范化 RGB 像素和尺寸的 SHA-256 指纹与刚记录的路径关联。
5. 切换到另一份同名文档 B，确认软件当前文档已变为 B。
6. 用隔离的 Edge 浏览器加载现有 `frontend/dist`，真实按 Ctrl+V。浏览器读系统剪贴板，不用合成 paste 事件或伪造图片输入。
7. 比较微信图片与浏览器粘贴图片的像素指纹，再查询原型记录。三个有效样本的图片均为 401×251，均匹配 A，而非当前 B。

浏览器使用独立临时上下文与空测试画板；全部 `/api/*` 请求被测试响应替代，外域请求被阻止。测试没有连接真实后端或修改用户画板。因此，本轮验证了真实剪贴板与现有编译前端的粘贴行为，没有验证桌面桥接、正式后端持久化或点击来源卡打开文件。

PDF/PPT 首次框选误包含窗口外背景，已剔除这两次截图，修正窗口状态后重新测试。最终有效样本额外核对选区角点与中心点所属的来源窗口；截图也与截图前同一区域的屏幕像素完全一致。这些检查由测试脚本完成，尚未成为原型对任意用户框选区域的识别能力。

PS 首次完整流程已通过。追加复核时，Photoshop 弹出“不能输入剪贴板，因为意外地遇到文件尾。”，导致后续 COM 调用返回应用忙碌。已关闭这个明确识别的剪贴板提示；没有把失败的复核计作通过。弹窗根因尚未定位，需排除微信、剪贴板读取时序和 Photoshop 导入行为之间的兼容问题。

### 2.2 第一轮路径接口测试

为 PSD、PDF 和 PPTX 分别创建三个样本，文件名相同，放在以下不同目录：

```text
build/source_probe/A/source sample.*
build/source_probe/B/source sample.*
build/source_probe/中文 空格/source sample.*
```

每次将接口返回的完整路径与期望路径逐一对照。测试覆盖不同目录的同名文件、中文路径、空格路径，以及切换回先前文档。

- Photoshop：三个样本打开时核对路径，随后切换文档四次，7 项全部一致。
- WPS PDF：按普通本地打开方式依次打开 A、B、中文目录，再回到 A，4 项全部一致。
- WPS 演示：按普通本地打开方式依次打开 A、B、中文目录，再回到 A，通过实际文档窗口读取来源，4 项全部一致。

只新建测试样本并读取文档元数据，没有保存或修改个人文档。测试结束已关闭这些样本文档；未强制结束包含其他文档的软件进程。

本机证据文件位于 Git 忽略的 `build/source_probe/`：

| 文件 | 内容 |
| --- | --- |
| `photoshop_results.json` | Photoshop 7 项路径对照 |
| `pdf_normal_open_results.json` | 普通打开 PDF 后的 4 项路径对照 |
| `ppt_normal_open_results.json` | 全局 WPS 演示 COM 对象连接错误实例的反例 |
| `ppt-native_normal_open_results.json` | 从 PPT 文档窗口读取的 4 项路径对照 |
| `probe_com.ps1` | COM 只读路径探测原型 |
| `probe_native_ppt.ps1` | 文档窗口原生对象探测原型 |

第一轮脚本选择样本文档窗口；本轮独立原型读取 Alt+A 时的实际前台窗口。所有脚本均只用于可行性验证，不是生产适配器。

### 2.3 本轮证据文件

均位于 Git 忽略的 `build/source_probe/`：

| 文件 | 内容 |
| --- | --- |
| `wechat_full_flow_result_ps.json` | PS 首次有效完整流程的路径、图片指纹与粘贴结果 |
| `wechat_full_flow_result_pdf.json` | PDF 最终有效样本，含选区归属与屏幕像素核对 |
| `wechat_full_flow_result_ppt.json` | PPTX 最终有效样本，含选区归属与屏幕像素核对 |
| `passive_observer_results_pdf.json` / `passive_observer_results_ppt.json` | 截图热键时的来源记录与图片绑定记录 |
| `wechat_clipboard_pdf.json` / `wechat_clipboard_ppt.json` | 真实微信截图事件及剪贴板格式 |
| `drop_it_wechat_ps_paste.png` / `drop_it_wechat_pdf_paste.png` / `drop_it_wechat_ppt_paste.png` | 隔离 Drop-It 前端实际生成的普通图片卡 |
| `passive_source_observer.py` | 独立被动监听与来源匹配原型 |
| `wechat_atomic.py` / `paste_real_clipboard.mjs` | 真实微信截图与真实浏览器粘贴测试 |
| `wechat_cleanup_results.json` | 只关闭测试目录内文档后的核对结果 |

已停止临时监听器，关闭本轮测试目录内的 PSD/PDF/PPTX；对应集合中未剩余本轮测试文档。清理辅助进程在 Python/.NET 卸载阶段出现 RPC 异常输出，发生在关闭与核对结果已写入之后。没有强制结束用户软件进程。

## 3. Photoshop：当前版本可以直接取得 PSD 路径

通过 Windows COM 连接 Photoshop，读取当前文档的 `FullName`。在本次安装版本中，读取本地 PSD 来源不需要额外安装 Photoshop 扩展。

普通 `GetActiveObject` 在初始连接时返回 `MK_E_UNAVAILABLE`。通过自动化连接已运行的 Photoshop 后可以读取文档。生产版必须先确认 Photoshop 已运行，并处理连接失败、超时和实例匹配，避免为了探测来源而启动一个新的空软件实例。

返回的是实际打开的源文件：PSD 返回 PSD，PSB 需追加样本验证；若打开的是 JPG，则返回 JPG，不能推导未打开的 PSD。

尚未验证：多个 Photoshop 进程、PSB、另存为后的连续截图、云文档、智能对象的外部源文件。Adobe UXP 的 `app.activeDocument.path` 可以作为其他版本的备选路线；本次未测试 UXP 扩展。

## 4. PDF：本机 WPS PDF 接口已实测

本机 `.pdf` 默认由 WPS 打开，且注册了 `KPDF.Application`。连接运行中的对象后，`ActiveDocument.FullName` 返回当前 PDF 的完整磁盘路径。

只读的界面检查显示，窗口标题及可访问文本提供的是文件名，没有完整路径。这证明来源应从文档接口读取，不能只依赖窗口标题。

一个值得保留的反例：对已经运行的 PDF 应用再次调用 COM 激活曾超时；连接现有 `KPDF.Application` 对象的路径读取成功。因此生产版优先附着运行中的实例，并设置超时。

尚未验证：WPS 多个独立 PDF 窗口的实例选择、浏览器 PDF、Adobe Acrobat、Foxit 等。PDF 是文件格式，来源接口仍取决于实际阅读器；不能把本次 WPS 结果外推到所有 PDF 软件。

## 5. PPT：需要从正在显示文档的窗口连接

本机 `PowerPoint.Application` 名称可以创建对象，甚至返回 `Microsoft PowerPoint` 名称，但 `Application.Path` 实际指向 WPS 安装目录。这是兼容自动化接口，不能作为微软 PowerPoint 实机测试的证据。

直接连接全局 `KWPP.Application`，得到的对象有 0 个演示文稿；此时用户界面已经打开样本。这条简单路线可能连接另一个后台实例，不能据此认定当前文档来源。

成功路线：

1. 找到真实演示文稿窗口及其 `mdiClass` 文档子窗口。
2. 调用 Windows `AccessibleObjectFromWindow`，使用 `OBJID_NATIVEOM` 与 `IID_IDispatch`。
3. 从返回的原生对象读取 `Presentation.FullName`，得到该文档的真实路径。
4. 从该对象的 `Application.ActivePresentation.FullName` 取得同一实例当前活动文档；切换 A、B、中文目录、A 后均与预期一致。

本次主窗体与 MDI 容器返回 `E_FAIL`，而具体 `mdiClass` 文档窗口成功。这说明必须选对窗口层级。

此外，WPS 的 `Application.ActiveWindow.HWND` 本次返回 0，不能单独用它验证窗口身份；应保留原始 Windows 文档子窗口句柄并建立映射。

首个手工拼装的 PPTX 缺少完整结构，WPS 报无法打开。最终改用工作区自带的 `python-pptx` 创建标准样本，路径测试结果全部来自这些有效样本。

尚未验证：微软 PowerPoint 实机、旧 `.ppt` 格式、WPS 多个独立实例、放映模式、受保护视图和云演示文稿。

## 6. 对产品实现的影响

建议把本次验证的软件作为首版候选，分别编写来源适配器；完成稳定性验证后再列入正式支持清单。

用户要求的外部截图流程需要新的关联层。以下路线已经在本机默认微信快捷键与三个受控样本中验证了来源匹配：

```text
Drop-It 在截图之前运行并记录来源上下文
  → 被动观察微信 Alt+A，在接管前台前记录文档路径
  → 将实际剪贴板图片与可信文档路径关联
  → 用户粘贴时匹配对应图片
  → 查询图片来源记录（本轮原型到此完成）
  → 截图头图 + 本地标志 + 文件名 + 原文件链接（待接入产品）
```

接口耗时、软件繁忙或来源无法确认时，保留截图并提供手动关联。来源快照必须在截图开始时固定；框选过程中切换文档时应取消自动关联。截图已经完成后切换到 B，不应丢弃已经绑定 A 的来源记录。

接入 Drop-It 后还需要验证：前台窗口匹配、多实例、原生打开、文件移动后的重新关联、截图与源文件未保存修改的区别，以及刷新、重启、复制、撤销和 `.drop` 保存恢复。

首版还需验证：任意选区与源窗口的对应、跨窗口和多显示器框选、连续截图、截图标注、图片格式转换、重复像素对应不同文件、过期记录、多个软件实例、取消截图、其他快捷键和微信菜单入口。QQ 在本机未发现运行或登记安装，未调用 QQ 截图，不能从微信结果推断 QQ 可用。

原型的 PS 连接在启动时初始化，故本轮观察器运行条件包含 Photoshop 已启动；生产版应让各软件适配器独立初始化，不能让 PDF/PPT 来源识别依赖 Photoshop。PDF 的 Qt 宿主标题只用于选择适配器，完整路径仍由 `KPDF.Application.ActiveDocument.FullName` 提供；多实例对应关系仍需验证。

这里只保存原文件引用，PSD、PDF 和 PPTX 留在原位置，不打包原文档。当前结论是“有实测依据的受控技术路线”，不是“正式自动来源功能已完成”，也不是“所有微信/QQ 截图均可可靠识别”。

## 7. 官方参考

- [Adobe Windows Photoshop 脚本与 COM 自动化](https://helpx.adobe.com/photoshop/using/scripting.html)
- [Photoshop UXP Document.path](https://developer.adobe.com/photoshop/uxp/2022/ps_reference/classes/document/)
- [PowerPoint Presentation.FullName](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.presentation.fullname)：微软 API 资料，未替代微软 PowerPoint 实机验证。
- [Windows AccessibleObjectFromWindow](https://learn.microsoft.com/en-us/windows/win32/api/oleacc/nf-oleacc-accessibleobjectfromwindow)：原生对象访问接口。

WPS 路径能力的结论来自本次实机结果，未找到或引用足以覆盖全部 WPS 版本的官方保证。
