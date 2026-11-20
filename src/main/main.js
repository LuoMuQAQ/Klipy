const { app, BrowserWindow, clipboard, dialog, ipcMain } = require('electron');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createBackendClient } = require('./backend-client');

const root = path.resolve(__dirname, '../..');
const indexPath = path.join(root, 'dist', 'index.html');
const devUrl = 'http://127.0.0.1:5173/';
const isDev = !app.isPackaged && process.env.AUTHENTICATOR_DEV_URL === devUrl;
const rendererUrl = isDev ? devUrl : pathToFileURL(indexPath).href;
const backend = createBackendClient(root);
let mainWindow;

function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    const frame = event.senderFrame;
    if (event.sender !== mainWindow?.webContents || !frame || frame.parent || frame.url !== rendererUrl) {
      throw new Error('不允许此页面访问身份验证器接口。');
    }
    return callback(...args);
  });
}

function registerIpc() {
  const actions = {
    list: 'list',
    add: 'add',
    delete: 'delete',
    update: 'update',
    parseUri: 'parseuri',
    parseMigration: 'parsemigration',
    validateSecret: 'validatesecret',
    groupList: 'grouplist',
    groupAdd: 'groupadd',
    groupRename: 'grouprename',
    groupDelete: 'groupdelete',
    groupReorder: 'groupreorder',
    reorder: 'reorder',
    export: 'export',
  };
  for (const [channel, action] of Object.entries(actions)) {
    handle(`authenticator:${channel}`, (params) => backend.request(action, params));
  }

  handle('authenticator:copy', (text) => {
    if (typeof text !== 'string') throw new TypeError('剪贴板内容必须是文本。');
    clipboard.writeText(text);
    return true;
  });
  handle('window:minimize', () => mainWindow.minimize());
  handle('window:close', () => mainWindow.close());
  handle('window:isMaximized', () => mainWindow.isMaximized());
  // 保留旧 bridge 接口，但交接版本的固定窗口不可最大化。
  handle('window:maximize', () => mainWindow.isMaximized());
}

async function createWindow() {
  if (!isDev && !existsSync(indexPath)) {
    throw new Error('未找到前端构建产物。请先运行 npm run build:vite。');
  }

  const win = new BrowserWindow({
    width: 400,
    height: 620,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#f5f7fa',
    title: 'Klipy',
    icon: path.join(root, 'public', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow = win;

  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererUrl) event.preventDefault();
  });
  win.on('closed', () => { mainWindow = undefined; });
  for (const event of ['maximize', 'unmaximize']) {
    win.on(event, () => win.webContents.send('window:maximized-changed', win.isMaximized()));
  }
  win.once('ready-to-show', () => win.show());
  if (isDev) await win.loadURL(rendererUrl);
  else await win.loadFile(indexPath);
}

app.whenReady().then(() => {
  registerIpc();
  return createWindow();
}).catch((error) => {
  dialog.showErrorBox('Klipy 启动失败', error.message);
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => backend.close());
