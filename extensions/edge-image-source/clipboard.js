import { clipboardHtml } from './core.js';

export async function writeImageWithSource(item, png) {
  if (!navigator.clipboard?.write || !globalThis.ClipboardItem) {
    throw new Error('此版本的 Edge 不支持多格式剪贴板，请更新浏览器。');
  }
  // One item with three representations; writing separately would overwrite them.
  const entry = new ClipboardItem({
    'image/png': png,
    'text/html': new Blob([clipboardHtml(item)], { type: 'text/html' }),
    'text/plain': new Blob([item.sourceUrl], { type: 'text/plain' })
  });
  await navigator.clipboard.write([entry]);
}

// On Chromium versions that require a focused document, execute this in the
// originating tab's isolated world. It must not depend on module imports.
export async function writeInPage(html, sourceUrl) {
  try {
    if (!navigator.clipboard?.write || !globalThis.ClipboardItem) {
      throw new Error('此网页无法访问剪贴板，请从扩展面板复制。');
    }
    const embedded = /<img src="(data:image\/png;base64,[A-Za-z0-9+/]+=*)"/.exec(html)?.[1];
    if (!embedded) throw new Error('图片数据无效。');
    const bytes = atob(embedded.split(',')[1]);
    const pixels = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index++) pixels[index] = bytes.charCodeAt(index);
    const png = new Blob([pixels], { type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({
      'image/png': png,
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([sourceUrl], { type: 'text/plain' })
    })]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
