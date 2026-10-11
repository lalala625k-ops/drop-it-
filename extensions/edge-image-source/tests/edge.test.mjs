import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright'); }
catch { throw new Error('请安装 Playwright 或设置 PLAYWRIGHT_MODULE_PATH 指向已有的 playwright 目录。'); }
const extension = fileURLToPath(new URL('../', import.meta.url));
const executablePath = process.env.EDGE_EXECUTABLE || (process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
const profile = await mkdtemp(path.join(tmpdir(), 'edge-image-source-test-'));

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(width, height) {
  const chunk = (type, bytes) => {
    const body = Buffer.concat([Buffer.from(type), bytes]);
    const header = Buffer.alloc(4); header.writeUInt32BE(bytes.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([header, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      pixels.set([80, 120, 180, x === 0 && y === 0 ? 0 : 255], offset);
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

const low = png(64, 32);
const high = png(128, 64);
const remote = createServer((request, response) => {
  response.setHeader('Content-Type', 'image/png');
  response.end(high); // Deliberately no CORS header.
});
await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
const cdn = `http://127.0.0.1:${remote.address().port}`;
let origin;
const server = createServer((request, response) => {
  const url = new URL(request.url, origin);
  if (url.pathname === '/low.png' || url.pathname === '/high.png') {
    response.setHeader('Content-Type', 'image/png'); response.end(url.pathname === '/high.png' ? high : low);
  } else if (url.pathname === '/blocked.png') {
    response.writeHead(403); response.end('Blocked');
  } else if (url.pathname === '/sample.svg') {
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="77" height="31"><rect width="77" height="31" fill="red"/></svg>');
  } else if (url.pathname === '/oversize.png') {
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Length', String(25 * 1024 * 1024)); response.end();
  } else {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><head><title>测试图片 &amp; 出处</title><link rel="canonical" href="/canonical"></head><body>
      <a href="/post/123?ref=image"><img id="linked" alt='测试&lt;script&gt;图片' src="/low.png" srcset="/low.png 64w, /high.png 128w" sizes="64px"></a>
      <img id="plain" src="/low.png"><img id="cross" src="${cdn}/image.png">
      <img id="blob"><img id="svg" src="/sample.svg">
      <picture><source media="(min-width: 1px)" srcset="/low.png 1x, /high.png 2x"><img id="picture" src="/sample.svg"></picture>
      <div id="rich" contenteditable="true"></div><textarea id="text"></textarea>
      <script>fetch('/low.png').then(r=>r.blob()).then(b=>{document.querySelector('#blob').src=URL.createObjectURL(b)})</script>
    </body></html>`);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
let context;
let passes = 0;
const check = label => { passes++; console.log(`PASS ${passes}: ${label}`); };

try {
  // Static test harness: service workers forbid dynamic import(). The shipping
  // extension is copied unchanged, with only a private wrapper in this temp copy.
  const unpacked = path.join(profile, 'test-extension');
  await cp(extension, unpacked, { recursive: true });
  await cp(path.join(unpacked, 'background.js'), path.join(unpacked, 'background-original.js'));
  await writeFile(path.join(unpacked, 'background.js'), "import { copyImage } from './background-original.js'; globalThis.__testCopyImage = copyImage;\n");
  context = await playwright.chromium.launchPersistentContext(profile, {
    executablePath, headless: true,
    args: [`--disable-extensions-except=${unpacked}`, `--load-extension=${unpacked}`],
    viewport: { width: 1100, height: 800 }
  });
  console.log(`Edge ${context.browser()?.version() || 'persistent context'}; isolated headless profile`);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20_000 });
  const id = worker.url().split('/')[2];
  const control = await context.newPage();
  await control.goto(`chrome-extension://${id}/popup.html`);
  const page = await context.newPage();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.goto(origin);
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth));
  const send = (type, fields = {}) => control.evaluate(message => chrome.runtime.sendMessage(message), { target: 'background', type, ...fields });
  const state = () => send('GET_STATE');
  async function copy(selector, extra = {}) {
    const image = await page.locator(selector).evaluate(img => ({ srcUrl: img.currentSrc, linkUrl: img.closest('a')?.href }));
    await worker.evaluate(async ({ info, pageUrl }) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(item => item.url === pageUrl);
      await globalThis.__testCopyImage({ menuItemId: 'copy-image-with-source', pageUrl, frameId: 0, ...info }, tab);
    }, { info: { ...image, ...extra }, pageUrl: page.url() });
    return state();
  }
  async function clipboard() {
    await page.bringToFront();
    return page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const result = { types: [...item.types] };
      for (const type of ['text/plain', 'text/html']) result[type] = await (await item.getType(type)).text();
      const image = await createImageBitmap(await item.getType('image/png'));
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      result.width = image.width; result.height = image.height;
      result.firstPixel = [...ctx.getImageData(0, 0, 1, 1).data];
      result.lastPixel = [...ctx.getImageData(image.width - 1, image.height - 1, 1, 1).data];
      image.close(); return result;
    });
  }

  let result = await copy('#linked');
  assert.equal(result.state, 'copied', result.message);
  assert.equal(result.item.width, 128); assert.equal(result.item.height, 64);
  assert.equal(result.item.sourceUrl, `${origin}/post/123?ref=image`);
  let copied = await clipboard();
  assert.deepEqual([...copied.types].sort(), ['image/png', 'text/html', 'text/plain'].sort());
  assert.equal(copied['text/plain'], result.item.sourceUrl);
  assert.ok(copied['text/html'].includes('data:image/png;base64,'));
  assert.equal(copied.width, 128); assert.equal(copied.height, 64);
  assert.equal(copied.firstPixel[3], 0);
  assert.deepEqual(copied.lastPixel, [80, 120, 180, 255]);
  check('right-click handler writes three formats, linked content URL, full srcset resolution and transparent PNG pixels');

  await page.locator('#rich').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await page.waitForFunction(() => document.querySelector('#rich img') && document.querySelector('#rich a'));
  assert.equal(await page.locator('#rich a').getAttribute('href'), `${origin}/post/123?ref=image`);
  await page.locator('#text').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  assert.equal(await page.locator('#text').inputValue(), `${origin}/post/123?ref=image`);
  check('actual paste into an HTML editor preserves image + clickable link; textarea receives only the URL');

  result = await copy('#plain');
  assert.equal(result.state, 'copied'); assert.equal(result.item.sourceUrl, `${origin}/canonical`);
  check('unlinked image records same-origin canonical webpage');

  result = await copy('#cross');
  assert.equal(result.state, 'copied', result.message); assert.equal(result.item.width, 128);
  check('cross-origin CDN image is copied without a CORS header');

  result = await copy('#blob');
  assert.equal(result.state, 'copied', result.message); assert.equal(result.item.width, 64);
  check('page-local Blob image uses full loaded pixels');

  result = await copy('#svg');
  assert.equal(result.state, 'copied', result.message); assert.equal(result.item.width, 77); assert.equal(result.item.height, 31);
  check('non-PNG input is decoded and converted to PNG at original dimensions');

  result = await copy('#picture');
  assert.equal(result.state, 'copied', result.message); assert.equal(result.item.width, 128);
  check('responsive picture source keeps the selected art direction and largest density variant');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForSelector('#result:not([hidden])');
  const edited = `${origin}/corrected?x=1&y=2`;
  await popup.locator('#source').fill(edited);
  await popup.locator('#copy').click();
  await popup.waitForFunction(() => document.querySelector('#status').textContent === '已复制图片和原链接。');
  copied = await clipboard(); assert.equal(copied['text/plain'], edited);
  assert.ok(copied['text/html'].includes('/corrected?x=1&amp;y=2') || copied['text/html'].includes('/corrected?x=1&y=2'));
  check('popup copy writes all formats with an edited source');
  if (process.env.EDGE_SCREENSHOT_PATH) {
    await popup.screenshot({ path: process.env.EDGE_SCREENSHOT_PATH, clip: { x: 0, y: 0, width: 360, height: await popup.evaluate(() => document.body.scrollHeight) } });
  }

  const latest = await state();
  const offline = await worker.evaluate(async ({ itemId }) => {
    const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'DOWNLOAD', format: 'html', itemId });
    if (!response.ok) throw new Error(response.error);
    // Read the extension-origin Blob in its own document, then release it.
    return response;
  }, { itemId: latest.item.id });
  const savedHtml = await popup.evaluate(url => fetch(url).then(response => response.text()), offline.url);
  const savedPath = path.join(profile, 'saved-with-source.html');
  await writeFile(savedPath, savedHtml);
  const exportPage = await context.newPage();
  await exportPage.goto(pathToFileURL(savedPath).href);
  await exportPage.waitForFunction(() => document.querySelector('img').complete && document.querySelector('img').naturalWidth);
  assert.equal(await exportPage.locator('a').getAttribute('href'), edited);
  assert.equal(await exportPage.locator('img').evaluate(img => img.complete && img.naturalWidth), 128);
  assert.ok((await exportPage.content()).includes('Content-Security-Policy'));
  check('standalone saved HTML opens with embedded full-size image and clickable source');

  const downloadDirectory = path.join(profile, 'downloads');
  await mkdir(downloadDirectory);
  const cdp = await context.newCDPSession(popup);
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory, eventsEnabled: true });
  // The native "Save as" dialog needs a human in a real browser. Suppress only
  // that dialog in the temporary test copy while using the real download API.
  await worker.evaluate(() => {
    const download = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = options => download({ ...options, saveAs: false });
  });
  await popup.bringToFront();
  for (const format of ['html', 'png']) {
    await popup.locator(`#save-${format}`).click();
    let download;
    for (let attempt = 0; attempt < 100; attempt++) {
      const downloads = await popup.evaluate(() => chrome.downloads.search({ orderBy: ['-startTime'], limit: 10 }));
      // CDP download interception may choose a UUID .htm instead of the
      // requested .html filename. Identify the real download by MIME.
      download = downloads.find(item => item.state === 'complete' && item.mime === (format === 'html' ? 'text/html' : 'image/png'));
      if (download) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(download, `${format} download completes: ${JSON.stringify(await popup.evaluate(() => chrome.downloads.search({ limit: 5 })))}`);
    const relative = path.relative(downloadDirectory, download.filename);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'test downloads stay in the temporary directory');
    const bytes = await readFile(download.filename);
    if (format === 'html') assert.ok(bytes.toString().includes('图片') && bytes.toString().includes('/corrected?x=1&amp;y=2'));
    else assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  check('both popup save buttons complete real downloads through the Edge downloads API');

  await page.bringToFront();
  const beforeFailure = await clipboard();
  result = await copy('#plain', { srcUrl: `${origin}/blocked.png`, linkUrl: undefined });
  assert.equal(result.state, 'error'); assert.ok(result.message.includes('403'));
  const afterFailure = await clipboard();
  assert.equal(afterFailure['text/plain'], beforeFailure['text/plain']);
  assert.equal(afterFailure.width, beforeFailure.width);
  assert.equal(result.item.id, latest.item.id);
  result = await copy('#plain', { srcUrl: `${origin}/oversize.png`, linkUrl: undefined });
  assert.equal(result.state, 'error'); assert.ok(result.message.includes('24 MB'));
  assert.equal((await clipboard())['text/plain'], beforeFailure['text/plain']);
  check('HTTP and image-size failures preserve clipboard and earlier preview');

  const stale = await send('GET_DATA', { sourceUrl: edited, itemId: 'stale-id' });
  assert.equal(stale.ok, false);
  await send('CLEAR');
  assert.equal((await state()).item, null);
  assert.equal((await clipboard())['text/plain'], edited);
  check('stale popup cannot edit a newer image; clearing preview preserves clipboard');

  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  for (const icon of Object.values(manifest.icons)) await readFile(path.join(extension, icon));
  console.log(`All ${passes} Edge integration checks passed.`);
} finally {
  await context?.close();
  await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => remote.close(resolve))]);
  // Explicitly verify the resolved target before recursive cleanup on Windows.
  const resolvedProfile = path.resolve(profile);
  const relative = path.relative(path.resolve(tmpdir()), resolvedProfile);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(resolvedProfile).startsWith('edge-image-source-test-')) {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3 });
  }
}
