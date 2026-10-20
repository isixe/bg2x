const { app, BrowserWindow, protocol, screen, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const HOST = 'bg2x';

const DEFAULT_WINDOW = { width: 1280, height: 820 };
const MIN_WINDOW = { width: 960, height: 640 };
const MIN_VISIBLE_EDGE = 100;
const SAVE_DELAY = 400;

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
  const candidates =
    relative === '' ? ['index.html'] : [relative, path.join(relative, 'index.html')];
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

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function readWindowState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const { x, y, width, height, maximized } = parsed;
    if (![x, y, width, height].every(isFiniteNumber)) return null;
    if (width < MIN_WINDOW.width || height < MIN_WINDOW.height) return null;
    return { x, y, width, height, maximized: maximized === true };
  } catch {
    return null;
  }
}

// Keep enough of the frame on a currently connected display, otherwise the
// window can be restored onto a monitor that no longer exists.
function isReachableOnSomeDisplay({ x, y, width, height }) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX = Math.min(x + width, workArea.x + workArea.width) - Math.max(x, workArea.x);
    const overlapY = Math.min(y + height, workArea.y + workArea.height) - Math.max(y, workArea.y);
    return overlapX >= MIN_VISIBLE_EDGE && overlapY >= MIN_VISIBLE_EDGE;
  });
}

function writeWindowState(window) {
  if (window.isDestroyed()) return;
  const maximized = window.isMaximized();
  const fullscreen = window.isFullScreen();
  const bounds = maximized || fullscreen ? window.getNormalBounds() : window.getBounds();
  const state = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized,
  };
  try {
    fs.writeFileSync(windowStatePath(), JSON.stringify(state));
  } catch {
    // Window geometry is a convenience; never block shutdown on it.
  }
}

function trackWindowState(window) {
  let timer = null;

  const save = () => {
    if (window.isDestroyed()) return;
    writeWindowState(window);
  };
  const scheduleSave = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY);
  };

  window.on('resize', scheduleSave);
  window.on('move', scheduleSave);
  window.on('maximize', scheduleSave);
  window.on('unmaximize', scheduleSave);
  window.on('close', () => {
    clearTimeout(timer);
    save();
  });
}

function createWindow() {
  const saved = readWindowState();
  // No state file means a first launch: open maximized instead of at the
  // fallback size. Afterwards the window follows whatever size it was left at.
  const shouldMaximize = !saved || saved.maximized;
  const options = {
    width: saved?.width ?? DEFAULT_WINDOW.width,
    height: saved?.height ?? DEFAULT_WINDOW.height,
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    backgroundColor: '#faf5ee',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (saved && isReachableOnSomeDisplay(saved)) {
    options.x = saved.x;
    options.y = saved.y;
  } else {
    options.center = true;
  }

  const window = new BrowserWindow(options);
  trackWindowState(window);

  if (shouldMaximize) window.maximize();
  // The OS can clamp the initial bounds before the window is laid out, which
  // silently swallows the first maximize(); retry once the window is ready.
  window.once('ready-to-show', () => {
    if (shouldMaximize && !window.isMaximized()) window.maximize();
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
