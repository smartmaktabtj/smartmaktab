'use strict';
const { app, BrowserWindow, protocol, session, shell, dialog, ipcMain } = require('electron');
const { registerContent } = require('./content-ipc.cjs');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const origin = 'smapp://smartmaktab';
const root = path.join(__dirname, 'web');

function logStartupError(label, err) {
  try {
    const dir = app.getPath('userData');
    fsSync.mkdirSync(dir, { recursive: true });
    const text = `[${new Date().toISOString()}] ${label}: ${err?.stack || err?.message || String(err)}\n`;
    fsSync.appendFileSync(path.join(dir, 'startup-error.log'), text, 'utf8');
  } catch {}
}

process.on('uncaughtException', err => {
  logStartupError('uncaughtException', err);
  if (app.isReady()) {
    try { dialog.showErrorBox('SmartMaktab — Ошибка запуска', String(err?.message || err)); } catch {}
  }
});
process.on('unhandledRejection', reason => {
  logStartupError('unhandledRejection', reason);
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'smapp',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.pfb': 'application/octet-stream',
};

const own = url => {
  try {
    const u = new URL(url);
    return u.protocol === 'smapp:' && u.hostname === 'smartmaktab' && !u.port && !u.username && !u.password;
  } catch {
    return false;
  }
};

const external = url => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (
      (u.hostname === 'raw.githubusercontent.com' && u.pathname.startsWith('/sharipovip/books/')) ||
      (u.hostname === 'github.com' && u.pathname.startsWith('/smartmaktabtj/smartmaktab/releases')) ||
      (u.hostname === 'objects.githubusercontent.com')
    );
  } catch {
    return false;
  }
};

function fetchGithubReleasesJson() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      'https://api.github.com/repos/smartmaktabtj/smartmaktab/releases?per_page=10',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'SmartMaktab-Windows-App',
        },
        timeout: 10000,
      },
      res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        let total = 0;
        res.on('data', chunk => {
          total += chunk.length;
          if (total > 512 * 1024) {
            req.destroy(new Error('response too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function registerSmappProtocol() {
  async function resolveAsset(requestUrl, method) {
    if (!own(requestUrl) || !['GET', 'HEAD'].includes(method)) return { status: 403 };
    try {
      const name = decodeURIComponent(new URL(requestUrl).pathname).replace(/^\//u, '') || 'index.html';
      if (name.includes('\\') || !/^[-\w./]+$/u.test(name) || name.split('/').some(s => ['.', '..'].includes(s))) {
        return { status: 404 };
      }
      const content = await fs.readFile(path.join(root, name));
      const fullMime = mime[path.extname(name)] ?? 'application/octet-stream';
      return { status: 200, fullMime, content };
    } catch {
      return { status: 404 };
    }
  }

  // Electron 25+ uses protocol.handle; Electron 22.3.27 (Win7/ia32) requires registerBufferProtocol!
  if (typeof protocol.handle === 'function') {
    protocol.handle('smapp', async request => {
      const res = await resolveAsset(request.url, request.method);
      if (res.status !== 200) return new Response(null, { status: res.status });
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(res.content), {
        headers: { 'Content-Type': res.fullMime, 'X-Content-Type-Options': 'nosniff' },
      });
    });
  } else {
    protocol.registerBufferProtocol('smapp', async (request, respond) => {
      const res = await resolveAsset(request.url, request.method || 'GET');
      if (res.status !== 200) {
        respond({ statusCode: res.status, data: Buffer.alloc(0) });
        return;
      }
      const baseMime = res.fullMime.split(';')[0].trim();
      const isUtf8 = res.fullMime.includes('utf-8') || baseMime.startsWith('text/') || baseMime.endsWith('json');
      respond({
        statusCode: 200,
        mimeType: baseMime,
        ...(isUtf8 ? { charset: 'utf-8' } : {}),
        headers: { 'X-Content-Type-Options': 'nosniff' },
        data: (request.method || 'GET') === 'HEAD' ? Buffer.alloc(0) : res.content,
      });
    });
  }
}

let mainWindow = null;

function create() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 540,
    autoHideMenuBar: true,
    backgroundColor: '#102821',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (external(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!own(url)) {
      event.preventDefault();
      if (external(url)) void shell.openExternal(url);
    }
  });
  win.webContents.on('will-redirect', (event, url) => {
    if (!own(url)) event.preventDefault();
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDesc, validatedURL) => {
    logStartupError('did-fail-load', `${errorCode} ${errorDesc} (${validatedURL})`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logStartupError('render-process-gone', JSON.stringify(details));
  });
  void win.loadURL(`${origin}/index.html`).catch(err => logStartupError('loadURL', err));
  return win;
}

if (typeof app?.requestSingleInstanceLock === 'function') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

function startDesktopApp() {
  app.whenReady().then(() => {
    try {
      app.setAppUserModelId(app.name === 'SmartMaktab Pilot' ? 'tj.smartmaktab.app.pilot' : 'tj.smartmaktab.app');
      registerContent({ app, ipcMain, dialog, BrowserWindow, own });
      registerSmappProtocol();

      const ses = session.defaultSession;
      ses.setPermissionCheckHandler((_wc, perm, url, detail) =>
        own(url) && own(detail?.embeddingOrigin || url) && ['media', 'fullscreen', 'clipboard-sanitized-write'].includes(perm),
      );
      ses.setPermissionRequestHandler((wc, permission, respond, details) => {
        if (!own(details.requestingUrl) || !own(wc.getURL()) || details.isMainFrame === false) {
          respond(false);
          return;
        }
        if (['fullscreen', 'clipboard-sanitized-write'].includes(permission)) {
          respond(true);
          return;
        }
        if (permission !== 'media') {
          respond(false);
          return;
        }
        const kinds = details.mediaTypes || [];
        dialog.showMessageBox(BrowserWindow.fromWebContents(wc), {
          type: 'question',
          buttons: ['Нет', 'Разрешить один раз'],
          defaultId: 0,
          cancelId: 0,
          message: `SmartMaktab запрашивает доступ: ${kinds.map(x => (x === 'audio' ? 'микрофон' : x === 'video' ? 'камера' : 'медиа')).join(', ')}.`,
        }).then(r => respond(r.response === 1), () => respond(false));
      });

      // Native sharing/open targets are selected by the user, not by arbitrary paths from WebView.
      ipcMain.handle('sm:open-file', async event => {
        if (!own(event.senderFrame?.url) || !own(event.sender.getURL())) return false;
        const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
          properties: ['openFile'],
          filters: [{ name: 'Документы и медиа', extensions: ['pdf', 'docx', 'png', 'jpg', 'mp3', 'mp4', 'wav', 'txt'] }],
        });
        return !result.canceled && /[.](pdf|docx|png|jpg|mp3|mp4|wav|txt)$/i.test(result.filePaths[0]) && !(await shell.openPath(result.filePaths[0]));
      });

      ipcMain.handle('sm:app:checkRelease', async event => {
        if (!own(event.senderFrame?.url) || !own(event.sender.getURL())) return { status: 'denied' };
        try {
          const currentVersion = String(app.getVersion?.() || '1.0.0');
          const releases = await fetchGithubReleasesJson();
          const winRel = (Array.isArray(releases) ? releases : []).find(
            r => !r.draft && /^windows-(?:unsigned-)?v\d+\.\d+\.\d+$/.test(r.tag_name || ''),
          );
          if (!winRel) return { status: 'none', currentVersion };
          const latestVersion = String(winRel.tag_name).replace(/^windows-(?:unsigned-)?v/, '');
          const setupAsset = (winRel.assets || []).find(a => /Windows-Setup/i.test(a.name || ''))
            || (winRel.assets || []).find(a => /\.exe$/i.test(a.name || ''));
          const cmp = (a, b) => {
            const pa = a.split('.').map(Number);
            const pb = b.split('.').map(Number);
            for (let i = 0; i < 3; i++) {
              if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
            }
            return 0;
          };
          const hasUpdate = cmp(latestVersion, currentVersion) > 0;
          return {
            status: hasUpdate ? 'available' : 'up-to-date',
            currentVersion,
            latestVersion,
            releaseUrl: winRel.html_url || 'https://github.com/smartmaktabtj/smartmaktab/releases',
            downloadUrl: setupAsset?.browser_download_url || winRel.html_url || '',
            assetName: setupAsset?.name || '',
          };
        } catch {
          return { status: 'network', currentVersion: String(app.getVersion?.() || '1.0.0') };
        }
      });

      ipcMain.handle('sm:app:openDownload', async (event, url) => {
        if (!own(event.senderFrame?.url) || !own(event.sender.getURL())) return false;
        if (external(url)) {
          await shell.openExternal(url);
          return true;
        }
        return false;
      });

      create();
      app.on('activate', () => {
        if (!BrowserWindow.getAllWindows().length) create();
      });
    } catch (err) {
      logStartupError('whenReady', err);
      try { dialog.showErrorBox('SmartMaktab — Ошибка запуска', String(err?.message || err)); } catch {}
    }
  });
  app.on('window-all-closed', () => app.quit());
}

if (require.main === module) {
  startDesktopApp();
}

module.exports = { own, external, mime, registerSmappProtocol, startDesktopApp };
