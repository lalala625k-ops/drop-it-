# Drop-it 0.1

English · [简体中文](README.md)

Drop-it is a visual workspace for collecting text, images and web links on an infinite 2D canvas. Arrange cards freely, build spatial groups and connect ideas with origin nodes.

## Features

- Web links become cards with a cover image, title and summary.
- Markdown notes and image cards share the same canvas.
- Groups support resizing, collapsing and moving their members together.
- Origin nodes connect cards and groups into a visual knowledge network.
- Search, a minimap and numbered pins help you navigate large boards.
- `.drop` files save boards, screenshots, groups, viewport and pins, with local recovery snapshots.
- Native Windows resizing and snapping work through the Edge WebView2 desktop shell.
- Experimental screenshot cards link back to local source documents.

## Screenshot source links — experimental

The source code updated on October 11, 2026 includes this feature. Start the updated Windows desktop app **before** capturing. Use WeChat's default **Alt+A** shortcut over a saved document, then paste the screenshot into Drop-It. When the source is verified, the card shows the screenshot, a local-file icon, filename and original path. Select the card first, then click its path to open the file with the default application.

The initial adapters target Photoshop 2024, WPS PDF and WPS Presentation. The crop must stay inside the source window and match the original pixels. Annotations, unsupported capture tools, ambiguous application instances or missing evidence produce an ordinary image card. Hold the right mouse button, move through **来源文件 (Source file) → 关联文件 (Associate file)** and release over the action to choose a file manually. The same menu opens, replaces or removes a reference; changes support undo.

QQ, Microsoft PowerPoint, other PDF readers, alternate shortcuts and edited or cross-window captures are not certified. Automatic records expire after five minutes or a clipboard change. Earlier controlled WeChat samples and the current automated/isolated UI tests are documented separately in [the verification report](FILE_SOURCE_FEASIBILITY.md); they do not establish universal capture compatibility.

Only the screenshot and path are saved. Original PSD, PDF and PPTX files stay at their original locations and are **not** bundled into `.drop` archives. Relink moved or deleted files, or when using a board on another computer. A link opens the disk file, not a historical snapshot of unsaved edits. References survive OCR, copying, undo, reload and workspace persistence. Native file opening and the file picker require the Windows desktop version.

## Run the latest source

Requirements: Windows 10/11 x64, Microsoft Edge WebView2 Runtime, Python and Node.js.

```powershell
python -m pip install -r backend/requirements-desktop.txt
npm --prefix frontend install
npm run dev
```

Restart the desktop app after updating native Python modules. Frontend hot reload alone cannot load the screenshot observer.

## Download a packaged version

Download the portable ZIP or Windows installer from [GitHub Releases](https://github.com/lalala625k-ops/drop-it-/releases). Updating `main` does not update an existing release installer; the screenshot source feature currently requires the updated source build.

## Stack and documentation

React 18, TypeScript, Vite and Tailwind CSS power the frontend. FastAPI and SQLite handle local APIs and persistence. Python/pywebview hosts the Windows app with Edge WebView2.

- [Product requirements](product_requirements_document.md)
- [Design specification](DESIGN_SPEC.md)
- [Architecture](ARCHITECTURE.md)
- [Desktop specification](DESKTOP_SPEC.md)
- [Screenshot source design](FILE_SCREENSHOT_PLAN.md)

## License

MIT. See [LICENSE](LICENSE).
