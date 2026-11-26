'use strict';

const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const packCore = require('./pack-core.cjs');

let mainWindow = null;

function logAdminError(label, err) {
  try {
    const dir = app.getPath('userData');
    fsSync.mkdirSync(dir, { recursive: true });
    fsSync.appendFileSync(
      path.join(dir, 'admin-error.log'),
      `[${new Date().toISOString()}] ${label}: ${err?.stack || err?.message || String(err)}\n`,
      'utf8',
    );
  } catch {}
}

process.on('uncaughtException', err => {
  logAdminError('uncaughtException', err);
  if (app.isReady()) {
    try { dialog.showErrorBox('SmartMaktab Admin — Ошибка', String(err?.message || err)); } catch {}
  }
});
process.on('unhandledRejection', reason => logAdminError('unhandledRejection', reason));

function configPath() {
  return path.join(app.getPath('userData'), 'admin-settings.json');
}

function dataPath() {
  return path.join(app.getPath('userData'), 'admin-data.json');
}

function encryptText(value) {
  if (!value) return '';
  if (safeStorage?.isEncryptionAvailable?.()) {
    return 'enc:' + safeStorage.encryptString(value).toString('base64');
  }
  return 'plain:' + Buffer.from(value, 'utf8').toString('base64');
}

function decryptText(stored) {
  if (!stored || typeof stored !== 'string') return '';
  if (stored.startsWith('enc:') && safeStorage?.isEncryptionAvailable?.()) {
    return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
  }
  if (stored.startsWith('plain:')) {
    return Buffer.from(stored.slice(6), 'base64').toString('utf8');
  }
  return stored;
}

async function readSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    return {
      ownerRepo: raw.ownerRepo || 'smartmaktabtj/smartmaktab',
      branch: raw.branch || 'main',
      branchFeedPath: raw.branchFeedPath || 'updates/latest.smupdate',
      supabaseEmail: raw.supabaseEmail || '',
      publicKeyBase64: raw.publicKeyBase64 || '',
      privatePem: decryptText(raw.privatePemEnc || ''),
      githubToken: decryptText(raw.githubTokenEnc || ''),
    };
  } catch {
    return {
      ownerRepo: 'smartmaktabtj/smartmaktab',
      branch: 'main',
      branchFeedPath: 'updates/latest.smupdate',
      supabaseEmail: '',
      publicKeyBase64: '',
      privatePem: '',
      githubToken: '',
    };
  }
}

async function writeSettings(next) {
  const payload = {
    ownerRepo: next.ownerRepo || 'smartmaktabtj/smartmaktab',
    branch: next.branch || 'main',
    branchFeedPath: next.branchFeedPath ?? 'updates/latest.smupdate',
    supabaseEmail: next.supabaseEmail || '',
    publicKeyBase64: next.publicKeyBase64 || '',
    privatePemEnc: encryptText(next.privatePem || ''),
    githubTokenEnc: encryptText(next.githubToken || ''),
  };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(payload, null, 2), { mode: 0o600 });
}

async function readAdminData() {
  try {
    const raw = JSON.parse(await fs.readFile(dataPath(), 'utf8'));
    return {
      pack: raw.pack || { schema: 1, sequence: 1, cabinets: {} },
      customRoles: Array.isArray(raw.customRoles) ? raw.customRoles : [],
      roleOverrides: raw.roleOverrides && typeof raw.roleOverrides === 'object' ? raw.roleOverrides : {},
      hiddenRoleIds: Array.isArray(raw.hiddenRoleIds) ? raw.hiddenRoleIds : [],
      lastPublishedPack: raw.lastPublishedPack || null,
    };
  } catch {
    return {
      pack: { schema: 1, sequence: 1, cabinets: {} },
      customRoles: [],
      roleOverrides: {},
      hiddenRoleIds: [],
      lastPublishedPack: null,
    };
  }
}

async function writeAdminData(state) {
  await fs.mkdir(path.dirname(dataPath()), { recursive: true });
  await fs.writeFile(dataPath(), JSON.stringify(state, null, 2), 'utf8');
}

function publicSettingsView(s) {
  return {
    ownerRepo: s.ownerRepo,
    branch: s.branch,
    branchFeedPath: s.branchFeedPath,
    supabaseEmail: s.supabaseEmail,
    publicKeyBase64: s.publicKeyBase64,
    hasPrivateKey: !!s.privatePem,
    hasGithubToken: !!s.githubToken,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0c1714',
    title: 'SmartMaktab Admin · .smupdate Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
}

function ensureOwn(e) {
  return !!mainWindow && e.sender === mainWindow.webContents;
}

function registerIpc() {
  const baseRoles = packCore.loadRegistry();
  const baseRoleIds = baseRoles.map(r => r.id);

  ipcMain.handle('sm-admin:init', async e => {
    if (!ensureOwn(e)) throw new Error('denied');
    const settings = await readSettings();
    const savedData = await readAdminData();
    return {
      roles: baseRoles,
      savedData,
      cloud: packCore.loadCloudDefaults(),
      settings: publicSettingsView(settings),
      limitBytes: packCore.LIMIT,
      maxDocxBytes: packCore.MAX_DOCX_BYTES,
      icons: packCore.ALLOWED_ICONS,
    };
  });

  ipcMain.handle('sm-admin:saveData', async (e, data) => {
    if (!ensureOwn(e)) throw new Error('denied');
    await writeAdminData(data);
    return { ok: true };
  });

  ipcMain.handle('sm-admin:exportJson', async (e, data) => {
    if (!ensureOwn(e)) throw new Error('denied');
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Экспорт проекта (admin-data.json)',
      defaultPath: path.join(app.getPath('downloads'), 'admin-data.json'),
      filters: [{ name: 'SmartMaktab JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    await fs.writeFile(res.filePath, JSON.stringify(data, null, 2), 'utf8');
    return { canceled: false, filePath: res.filePath };
  });

  ipcMain.handle('sm-admin:importJson', async e => {
    if (!ensureOwn(e)) throw new Error('denied');
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'SmartMaktab JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const parsed = JSON.parse(await fs.readFile(res.filePaths[0], 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.pack) {
      throw new Error('Файл JSON не содержит корректного проекта SmartMaktab Admin');
    }
    return { canceled: false, data: parsed, filePath: res.filePaths[0] };
  });

  ipcMain.handle('sm-admin:pickDocx', async e => {
    if (!ensureOwn(e)) throw new Error('denied');
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Word Template (.docx)', extensions: ['docx'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const buf = await fs.readFile(res.filePaths[0]);
    const validated = packCore.validateDocxBuffer(buf, path.basename(res.filePaths[0]));
    return { canceled: false, ...validated };
  });

  ipcMain.handle('sm-admin:saveSettings', async (e, patch) => {
    if (!ensureOwn(e)) throw new Error('denied');
    const cur = await readSettings();
    const next = {
      ownerRepo: String(patch.ownerRepo ?? cur.ownerRepo).trim() || 'smartmaktabtj/smartmaktab',
      branch: String(patch.branch ?? cur.branch).trim() || 'main',
      branchFeedPath: String(patch.branchFeedPath ?? cur.branchFeedPath).trim(),
      supabaseEmail: String(patch.supabaseEmail ?? cur.supabaseEmail).trim(),
      publicKeyBase64: String(patch.publicKeyBase64 ?? cur.publicKeyBase64).trim(),
      privatePem: patch.clearPrivateKey ? '' : (patch.privatePem ? String(patch.privatePem).trim() : cur.privatePem),
      githubToken: patch.clearGithubToken ? '' : (patch.githubToken ? String(patch.githubToken).trim() : cur.githubToken),
    };
    if (next.privatePem && !next.publicKeyBase64) {
      next.publicKeyBase64 = packCore.publicBase64FromPrivatePem(next.privatePem);
    }
    await writeSettings(next);
    return publicSettingsView(next);
  });

  ipcMain.handle('sm-admin:pickKeyFile', async e => {
    if (!ensureOwn(e)) throw new Error('denied');
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Ed25519 Key', extensions: ['smupdate-key', 'pem', 'key'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const pem = await fs.readFile(res.filePaths[0], 'utf8');
    const pub = packCore.publicBase64FromPrivatePem(pem);
    const cur = await readSettings();
    cur.privatePem = pem;
    cur.publicKeyBase64 = pub;
    await writeSettings(cur);
    return { canceled: false, settings: publicSettingsView(cur) };
  });

  ipcMain.handle('sm-admin:generateKeys', async e => {
    if (!ensureOwn(e)) throw new Error('denied');
    const pair = packCore.generateEd25519Keypair();
    const saveRes = await dialog.showSaveDialog(mainWindow, {
      title: 'Сохранить приватный ключ Ed25519 (вне репозитория!)',
      defaultPath: path.join(app.getPath('documents'), 'publisher.smupdate-key'),
      filters: [{ name: 'SmartMaktab Key', extensions: ['smupdate-key'] }],
    });
    if (saveRes.canceled || !saveRes.filePath) return { canceled: true };
    await fs.writeFile(saveRes.filePath, pair.privatePem, { mode: 0o600 });
    await fs.writeFile(saveRes.filePath + '.SM_CONTENT_PUBLIC_KEY.txt', pair.publicBase64 + '\n', 'utf8');
    const cur = await readSettings();
    cur.privatePem = pair.privatePem;
    cur.publicKeyBase64 = pair.publicBase64;
    await writeSettings(cur);
    return {
      canceled: false,
      filePath: saveRes.filePath,
      publicKeyBase64: pair.publicBase64,
      settings: publicSettingsView(cur),
    };
  });

  ipcMain.handle('sm-admin:validatePack', async (e, payload) => {
    if (!ensureOwn(e)) throw new Error('denied');
    return packCore.validatePack(payload, baseRoleIds);
  });

  ipcMain.handle('sm-admin:diffPack', async (e, { prevPack, nextPack, roleTitles }) => {
    if (!ensureOwn(e)) throw new Error('denied');
    return packCore.computePackDiff(prevPack, nextPack, roleTitles);
  });

  ipcMain.handle('sm-admin:openSmupdate', async e => {
    if (!ensureOwn(e)) throw new Error('denied');
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'SmartMaktab Content Pack', extensions: ['smupdate'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const buf = await fs.readFile(res.filePaths[0]);
    const cur = await readSettings();
    const payload = packCore.verifyAndOpenSmupdate(buf, cur.publicKeyBase64, cur.privatePem, baseRoleIds);
    return { canceled: false, filePath: res.filePaths[0], payload };
  });

  ipcMain.handle('sm-admin:saveSmupdate', async (e, payload) => {
    if (!ensureOwn(e)) throw new Error('denied');
    const cur = await readSettings();
    if (!cur.privatePem) throw new Error('Не настроен приватный ключ Ed25519 (в Настройках)');
    const signed = packCore.signPackWithPem(payload, cur.privatePem, baseRoleIds);
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Сохранить подписанный пакет .smupdate',
      defaultPath: path.join(app.getPath('downloads'), `smartmaktab-content-v${payload.sequence}.smupdate`),
      filters: [{ name: 'SmartMaktab Content Pack', extensions: ['smupdate'] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    await fs.writeFile(res.filePath, signed.buffer);
    return { canceled: false, filePath: res.filePath, bytes: signed.bytes, sha256: signed.sha256 };
  });

  ipcMain.handle('sm-admin:publishGithub', async (e, { payload, tag, releaseName, notes }) => {
    if (!ensureOwn(e)) throw new Error('denied');
    const cur = await readSettings();
    if (!cur.privatePem) throw new Error('Не настроен приватный ключ Ed25519');
    if (!cur.githubToken) throw new Error('Не указан GitHub Token (PAT с правами repo)');
    const signed = packCore.signPackWithPem(payload, cur.privatePem, baseRoleIds);
    const fileName = `smartmaktab-content-v${payload.sequence}.smupdate`;
    const result = await packCore.publishReleaseToGithub({
      token: cur.githubToken,
      ownerRepo: cur.ownerRepo,
      branch: cur.branch,
      branchFeedPath: cur.branchFeedPath,
      tag: tag || `content-v${payload.sequence}`,
      name: releaseName || `SmartMaktab Content v${payload.sequence}`,
      notes: notes || `Пакет материалов SmartMaktab (версия ${payload.sequence}, ${signed.bytes} байт, sha256:${signed.sha256.slice(0, 12)})`,
      fileName,
      buffer: signed.buffer,
    });
    return { ...result, bytes: signed.bytes, sha256: signed.sha256 };
  });

  ipcMain.handle('sm-admin:slugId', (_e, text, fallback) => packCore.slugId(text, fallback));
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    try {
      registerIpc();
      createWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    } catch (err) {
      logAdminError('whenReady', err);
      try { dialog.showErrorBox('SmartMaktab Admin — Ошибка запуска', String(err?.message || err)); } catch {}
    }
  });
} else {
  app.quit();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
