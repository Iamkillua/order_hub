const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const store = require('./store.cjs');
const google = require('./google.cjs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const REQUIRED = ['sku', 'order id', 'order date', 'pickup date', 'shipped'];

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#1e1f22',
    title: 'Order Hub',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1e1f22', symbolColor: '#b5bac1', height: 30 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (DEV_URL && url.startsWith(DEV_URL)) return;
    e.preventDefault();
  });
  win.on('focus', () => win.webContents.send('window:focus'));

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function publicState() {
  const c = store.load();
  return {
    hasCredentials: !!c.clientId,
    clientId: c.clientId,
    signedIn: !!(c.tokens && (c.tokens.refresh_token || c.tokens.access_token)),
    account: c.account,
    sheet: c.sheet,
    refreshSeconds: c.refreshSeconds,
    version: app.getVersion(),
  };
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, code: err.code || 'ERROR', message: err.message || String(err) };
    }
  });
}

handle('state:get', () => publicState());
handle('credentials:save', ({ clientId, clientSecret }) => {
  const id = String(clientId || '').trim();
  if (!/\.apps\.googleusercontent\.com$/.test(id)) {
    throw new google.AppError('BAD_CLIENT_ID', 'Client IDs end with “.apps.googleusercontent.com”. Copy it again from Google Cloud Console.');
  }
  const changed = id !== store.load().clientId;
  store.save({
    clientId: id,
    clientSecret: String(clientSecret || '').trim(),
    ...(changed ? { tokens: null, account: null } : {}),
  });
  return publicState();
});
handle('auth:signIn', async () => {
  await google.signIn();
  return publicState();
});
handle('auth:cancel', () => google.cancelSignIn());
handle('auth:signOut', () => {
  google.signOut();
  return publicState();
});
handle('sheet:inspect', (input) => google.inspectSpreadsheet(input));
handle('sheet:preview', async ({ spreadsheetId, tab }) => {
  const values = await google.readTab(spreadsheetId, tab);
  const headers = (values[0] || []).map((h) => String(h ?? '').trim());
  const lower = headers.map((h) => h.toLowerCase().replace(/\s+/g, ' '));
  return {
    headers,
    missing: REQUIRED.filter((r) => !lower.includes(r)),
    rowCount: Math.max(0, values.length - 1),
  };
});
handle('sheet:select', ({ spreadsheetId, title, tab }) => {
  store.save({ sheet: { spreadsheetId, title, tab } });
  return publicState();
});
handle('sheet:clear', () => {
  store.save({ sheet: null });
  return publicState();
});
handle('settings:save', ({ refreshSeconds }) => {
  const n = Math.max(15, Math.min(3600, Number(refreshSeconds) || 60));
  store.save({ refreshSeconds: n });
  return publicState();
});
handle('orders:load', () => google.loadOrders());
handle('orders:setShipped', (items) => google.setShipped(items));
handle('nicknames:load', () => google.loadNicknames());
handle('nicknames:save', (list) => google.saveNicknames(list));
handle('shell:open', (url) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});

ipcMain.on('window:titlebar', (_e, theme) => {
  if (!win || win.isDestroyed()) return;
  const t = theme === 'setup' ? { color: '#404eed', symbolColor: '#ffffff' } : { color: '#1e1f22', symbolColor: '#b5bac1' };
  win.setTitleBarOverlay({ ...t, height: 30 });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    if (!DEV_URL) Menu.setApplicationMenu(null);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
