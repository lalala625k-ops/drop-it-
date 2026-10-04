const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const { readFile, stat } = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const webDir = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(root, 'frontend', 'dist');
let service = null;
let bridge = null;

async function health() {
  try {
    const response = await fetch('http://127.0.0.1:8000/api/health');
    return response.ok && (await response.json()).app === 'infinite-canvas-note';
  } catch {
    return false;
  }
}

async function waitForService() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await health()) return;
    if (service && service.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('本地数据服务未能启动。请检查 8000 端口及应用日志。');
}

function startService(token) {
  const logDir = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'InfiniteCanvasNote');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
  let stdioConfig = 'ignore';
  try {
    const logStream = fs.createWriteStream(path.join(logDir, 'desktop_service.log'), { flags: 'a' });
    stdioConfig = ['ignore', logStream, logStream];
  } catch {}

  const env = {
    ...process.env,
    PINBOARD_DESKTOP: '1',
    PINBOARD_DATA_DIR: process.env.PINBOARD_DATA_DIR || path.join(logDir, 'data'),
    PINBOARD_MIGRATION_TOKEN: token,
    PINBOARD_WEB_DIR: webDir,
  };
  const command = app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'pinboard-service.exe')
    : 'python';
  const args = app.isPackaged ? [] : ['-m', 'backend.desktop_server'];
  service = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: stdioConfig });
}

function startBrowserBridge() {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  bridge = createServer(async (request, response) => {
    try {
      const parsed = new URL(request.url, 'http://localhost:5173');
      const relative = decodeURIComponent(parsed.pathname === '/' ? '/index.html' : parsed.pathname);
      const target = path.resolve(webDir, '.' + relative);
      if (!target.startsWith(webDir + path.sep) && target !== path.join(webDir, 'index.html')) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(target);
      const file = info.isFile() ? target : path.join(webDir, 'index.html');
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  bridge.on('error', () => { bridge = null; });
  bridge.listen(5173, '127.0.0.1');
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#d6d3cb',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#d6d3cb', symbolColor: '#1d1d1d', height: 36 },
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://127.0.0.1:8000/')) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
  await window.loadURL('http://127.0.0.1:8000/?desktop=1');
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  Menu.setApplicationMenu(null);
  try {
    const alreadyRunning = await health();
    const token = randomBytes(24).toString('hex');
    if (!alreadyRunning) startService(token);
    await waitForService();
    await createWindow();
    const status = await fetch('http://127.0.0.1:8000/api/migration/status').then((res) => res.json()).catch(() => ({ needed: false }));
    if (status && status.needed) {
      const migrationToken = await fetch('http://127.0.0.1:8000/api/migration/token').then((res) => res.json()).catch(() => null);
      if (migrationToken && migrationToken.token) {
        startBrowserBridge();
        await shell.openExternal(`http://localhost:5173/?migrate=${migrationToken.token}`);
      }
    }
  } catch (error) {
    dialog.showErrorBox('随想便签启动失败', String(error));
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  bridge?.close();
  service?.kill();
});
