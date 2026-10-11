import { webUrl, offlineHtml, filename } from './core.js';
import { imageBlob, asPng } from './image-data.js';
import { writeImageWithSource } from './clipboard.js';

let last = null;
const downloads = new Set();

async function prepare(payload) {
  let failure = new Error('未找到可读取的图片。');
  for (const url of payload.candidates) {
    try {
      const image = await asPng(await imageBlob(url));
      last = { ...payload, ...image, id: crypto.randomUUID(), imageUrl: url, copied: false };
      return;
    } catch (error) { failure = error; }
  }
  throw failure;
}

function summary() {
  if (!last) return null;
  const { preview, width, height, sourceUrl, sourceKind, pageUrl, title, copied, imageUrl, id } = last;
  return { preview, width, height, sourceUrl, sourceKind, pageUrl, title, copied, imageUrl, id };
}

function updateSource(value, expectedId) {
  if (!last) throw new Error('请先在网页图片上右键复制。');
  if (expectedId !== last.id) throw new Error('图片已更新，请重新打开扩展后操作。');
  if (value && value !== last.sourceUrl) {
    const source = webUrl(value);
    if (!source) throw new Error('请输入完整的 HTTP 或 HTTPS 网页链接。');
    last.sourceUrl = source;
    last.sourceKind = '手动设置的出处';
    last.copied = false;
  }
}

function release(url) {
  if (downloads.delete(url)) URL.revokeObjectURL(url);
}

async function handle(message) {
  if (message.type === 'PREPARE') {
    await prepare(message.payload);
    try {
      await writeImageWithSource(last, last.png);
      last.copied = true;
      return { ok: true, item: summary() };
    } catch (error) {
      return { ok: false, prepared: true, error: error.message, item: summary() };
    }
  }
  if (message.type === 'GET_PREVIEW') return { ok: true, item: summary() };
  if (message.type === 'GET_DATA') {
    updateSource(message.sourceUrl, message.itemId);
    const { dataUrl, sourceUrl, title, width, height, id } = last;
    return { ok: true, item: { dataUrl, sourceUrl, title, width, height, id } };
  }
  if (message.type === 'MARK_COPIED') {
    if (!last || last.id !== message.itemId) return { ok: false, error: '图片已更新，请重新复制。' };
    last.copied = true;
    return { ok: true };
  }
  if (message.type === 'DOWNLOAD') {
    updateSource(message.sourceUrl, message.itemId);
    const format = message.format === 'png' ? 'png' : 'html';
    const blob = format === 'png' ? last.png : new Blob([offlineHtml(last)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    downloads.add(url);
    setTimeout(() => release(url), 5 * 60_000);
    return { ok: true, url, filename: filename(last.title, format) };
  }
  if (message.type === 'RELEASE_DOWNLOAD') {
    release(message.url);
    return { ok: true };
  }
  if (message.type === 'CLEAR') {
    last = null;
    return { ok: true };
  }
  throw new Error('未知操作。');
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target !== 'offscreen' || sender.id !== chrome.runtime.id) return;
  handle(message).then(reply, error => reply({ ok: false, error: error.message }));
  return true;
});
