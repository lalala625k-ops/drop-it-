import { inspectImage } from './source-reader.js';
import { resolveSource, clipboardHtml } from './core.js';
import { writeInPage } from './clipboard.js';

const MENU = 'copy-image-with-source';
let creatingOffscreen;
let queue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU, title: '复制图片和原链接', contexts: ['image'] });
  });
});
chrome.runtime.onStartup.addListener(() => { status('idle', '在网页图片上右键开始').catch(() => {}); });

async function hasOffscreen() {
  const documents = await chrome.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (documents) return documents.length > 0;
  const windows = await clients.matchAll();
  return windows.some(client => client.url === chrome.runtime.getURL('offscreen.html'));
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['CLIPBOARD', 'BLOBS'],
      justification: '将用户右键选中的图片转换为 PNG，并连同网页出处写入系统剪贴板。'
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function offscreen(type, fields = {}) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type, ...fields });
}

async function status(state, message) {
  await chrome.storage.session.set({ state, message });
  await chrome.action.setBadgeBackgroundColor({ color: '#1d1d1d' });
  await chrome.action.setBadgeText({ text: { busy: '…', copied: '✓', error: '!', ready: '1', idle: '' }[state] });
  await chrome.action.setTitle({ title: `图片带出处：${message}` });
}

async function inspect(tabId, info, pixels = false) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [info.frameId || 0] },
      func: inspectImage, args: [info, pixels]
    });
    return results[0]?.result || {};
  } catch {
    // Browser-managed image documents may not permit injection; direct fetch still works.
    return {};
  }
}

export async function copyImage(info, tab) {
  await status('busy', '正在读取图片与出处…');
  try {
    const details = await inspect(tab.id, info);
    const source = resolveSource(info, details, tab);
    const payload = {
      ...source,
      title: (details.alt || details.title || tab.title || '图片').slice(0, 200),
      candidates: details.candidates?.length ? details.candidates : [info.srcUrl]
    };
    let result = await offscreen('PREPARE', { payload });
    if (!result.ok && !result.prepared) {
      const fallback = await inspect(tab.id, info, true);
      if (fallback.pixels) result = await offscreen('PREPARE', { payload: { ...payload, candidates: [fallback.pixels] } });
    }
    if (result.prepared) {
      // Async Clipboard on some Edge versions rejects an offscreen document.
      // The user's active tab provides focus without an extra copy click.
      try {
        const data = await offscreen('GET_DATA', { itemId: result.item.id });
        if (data.ok) {
          const [write] = await chrome.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [0] },
            func: writeInPage, args: [clipboardHtml(data.item), data.item.sourceUrl]
          });
          if (write?.result?.ok) {
            await offscreen('MARK_COPIED', { itemId: result.item.id });
            result.ok = true;
          }
        }
      } catch {
        // Insecure HTTP and protected pages can still copy from the popup.
      }
    }
    if (result.ok) {
      await status('copied', `已复制图片和原链接 · ${result.item.width} × ${result.item.height}`);
    } else if (result.prepared) {
      await status('ready', '图片已准备好；点击扩展图标，再点“复制图片和原链接”。');
      await chrome.action.openPopup?.().catch(() => {});
    } else {
      throw new Error(result.error || '无法读取图片。');
    }
  } catch (error) {
    await status('error', error.message || '复制失败，请重试。');
    await chrome.action.openPopup?.().catch(() => {});
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU || !tab?.id) return;
  queue = queue.then(() => copyImage(info, tab)).catch(error => console.error(error.message));
});

async function handle(message) {
  if (message.type === 'GET_STATE') {
    const state = await chrome.storage.session.get(['state', 'message']);
    const preview = await hasOffscreen() ? await offscreen('GET_PREVIEW') : { item: null };
    return { ok: true, ...state, item: preview.item };
  }
  if (message.type === 'GET_DATA') return offscreen('GET_DATA', { sourceUrl: message.sourceUrl, itemId: message.itemId });
  if (message.type === 'COPIED') {
    const result = await offscreen('MARK_COPIED', { itemId: message.itemId });
    if (!result.ok) return result;
    await status('copied', '已复制图片和原链接');
    return { ok: true };
  }
  if (message.type === 'DOWNLOAD') {
    const result = await offscreen('DOWNLOAD', { format: message.format, sourceUrl: message.sourceUrl, itemId: message.itemId });
    if (!result.ok) return result;
    try {
      const id = await chrome.downloads.download({ url: result.url, filename: result.filename, saveAs: true });
      await chrome.storage.session.set({ [`download_${id}`]: result.url });
      const [download] = await chrome.downloads.search({ id });
      if (download?.state !== 'in_progress') await releaseDownload(id);
      return { ok: true };
    } catch (error) {
      await offscreen('RELEASE_DOWNLOAD', { url: result.url });
      throw error;
    }
  }
  if (message.type === 'CLEAR') {
    if (await hasOffscreen()) await offscreen('CLEAR');
    await status('idle', '在网页图片上右键开始');
    return { ok: true };
  }
  throw new Error('未知操作。');
}

async function releaseDownload(id) {
  const key = `download_${id}`;
  const saved = await chrome.storage.session.get(key);
  if (saved[key] && await hasOffscreen()) await offscreen('RELEASE_DOWNLOAD', { url: saved[key] });
  await chrome.storage.session.remove(key);
}

chrome.downloads.onChanged.addListener(change => {
  if (['complete', 'interrupted'].includes(change.state?.current)) {
    releaseDownload(change.id).catch(error => console.error(error.message));
  }
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.target !== 'background' || sender.id !== chrome.runtime.id) return;
  handle(message).then(reply, error => reply({ ok: false, error: error.message }));
  return true;
});
