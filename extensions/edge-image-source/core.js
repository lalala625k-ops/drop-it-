export const MAX_BYTES = 24 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;

export function webUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim(), base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function resolveSource(info, details, tab) {
  const pageUrl = webUrl(info.frameUrl) || webUrl(info.pageUrl) || webUrl(tab?.url);
  if (!pageUrl) throw new Error('请在普通 HTTP 或 HTTPS 网页的图片上使用此功能。');
  const imageUrl = webUrl(info.srcUrl, pageUrl);
  const link = webUrl(info.linkUrl, pageUrl);
  const isImageLink = link && (link === imageUrl || /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico)(?:$|[?#])/i.test(link));
  const sameDocument = link && link.split('#')[0] === pageUrl.split('#')[0];
  if (link && !isImageLink && !sameDocument) {
    return { pageUrl, sourceUrl: link, sourceKind: '图片指向的网页' };
  }
  const canonical = webUrl(details?.canonical, pageUrl);
  // Only trust a canonical belonging to this document, on the same origin.
  if (canonical && webUrl(details?.pageUrl) === pageUrl && new URL(canonical).origin === new URL(pageUrl).origin) {
    return { pageUrl, sourceUrl: canonical, sourceKind: '当前网页的正式地址' };
  }
  return { pageUrl, sourceUrl: pageUrl, sourceKind: '当前网页' };
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function clipboardHtml(item) {
  const source = webUrl(item.sourceUrl);
  if (!source || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(item.dataUrl)) {
    throw new Error('图片或出处格式无效，未写入剪贴板。');
  }
  return `<div><img src="${item.dataUrl}" alt="${escapeHtml(item.title || '图片')}" width="${item.width}" height="${item.height}" style="max-width:100%;height:auto" />` +
    `<p>出处：<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source)}</a></p></div>`;
}

export function offlineHtml(item) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
<meta name="referrer" content="no-referrer" />
<title>${escapeHtml(item.title || '图片与出处')}</title>
<style>body{margin:0;padding:32px;background:#d6d3cb;color:#1d1d1d;font:15px/1.5 system-ui,sans-serif}main{max-width:1200px;margin:auto;background:#fff;padding:24px}img{display:block;max-width:100%;height:auto}p{margin:20px 0 0;overflow-wrap:anywhere}a{color:inherit;text-underline-offset:3px}</style>
</head><body><main>${clipboardHtml(item)}</main></body></html>`;
}

export function filename(title, extension) {
  const safe = String(title || '图片').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 80) || '图片';
  const name = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(safe) ? `图片_${safe}` : safe;
  return `${name}${extension === 'html' ? '-含出处' : ''}.${extension}`;
}
