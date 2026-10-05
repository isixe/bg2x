const { app, BrowserWindow, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const HOST = 'bg2x';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function isInsideDist(target) {
  const relative = path.relative(DIST_DIR, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.replace(/^[/\\]+/, '');
  const candidates = relative === '' ? ['index.html'] : [relative, path.join(relative, 'index.html')];
  for (const candidate of candidates) {
    const full = path.join(DIST_DIR, candidate);
    if (!isInsideDist(full)) continue;
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch {
      continue;
    }
  }
  const fallback = path.join(DIST_DIR, 'index.html');
  return fs.existsSync(fallback) ? fallback : null;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#faf5ee',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  window.loadURL(`app://${HOST}/`);
}

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-webgpu');

app.whenReady().then(() => {
  protocol.handle('app', async (request) => {
    const requestUrl = new URL(request.url);
    const filePath = resolveFilePath(requestUrl.pathname);
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }
    const data = await fs.promises.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': MIME_TYPES[extension] ?? 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'cross-origin-resource-policy': 'cross-origin',
    };
    return new Response(data, { headers });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
