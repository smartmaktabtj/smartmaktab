'use strict';
const { app, BrowserWindow, session, shell, dialog } = require('electron');
const path = require('node:path');

const LIVE_HOST = 'smartmaktabtj.github.io';
const LIVE_ADMIN_URL = `https://${LIVE_HOST}/smartmaktab/admin/index.html`;

const own = url => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:'
      && u.hostname === LIVE_HOST
      && !u.port
      && !u.username
      && !u.password
      && (u.pathname === '/smartmaktab' || u.pathname.startsWith('/smartmaktab/'));
  } catch {
    return false;
  }
};

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 640,
    minHeight: 540,
    autoHideMenuBar: true,
    backgroundColor: '#102821',
    icon: path.join(__dirname, 'icon.png'),
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
    if (/^https:\/\/github\.com\/smartmaktabtj\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!own(url)) event.preventDefault();
  });
  win.webContents.on('will-redirect', (event, url) => {
    if (!own(url)) event.preventDefault();
  });
  win.webContents.on('did-fail-load', (_event, errorCode, _desc, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || win.isDestroyed()) return;
    void dialog.showMessageBox(win, {
      type: 'error',
      title: 'SmartMaktab Admin',
      buttons: ['Боз кӯшиш кардан', 'Пӯшидан'],
      defaultId: 0,
      cancelId: 1,
      message: 'Пайвасти интернет нест ё саҳифаи маъмур кушода нашуд.',
    }).then(r => {
      if (r.response === 0 && !win.isDestroyed()) void win.loadURL(LIVE_ADMIN_URL);
      else if (r.response === 1 && !win.isDestroyed()) win.close();
    }).catch(() => {});
  });
  void win.webContents.session.clearCache()
    .catch(() => {})
    .then(() => win.loadURL(LIVE_ADMIN_URL))
    .catch(() => {});
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

function startAdminApp() {
  app.commandLine?.appendSwitch?.('disable-http-cache');
  app.whenReady().then(() => {
    app.setAppUserModelId('tj.smartmaktab.admin');
    const ses = session.defaultSession;
    ses.setPermissionCheckHandler(() => false);
    ses.setPermissionRequestHandler((_wc, _perm, respond) => respond(false));
    createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });
  app.on('window-all-closed', () => app.quit());
}

if (require.main === module) {
  startAdminApp();
}

module.exports = { own, startAdminApp };
