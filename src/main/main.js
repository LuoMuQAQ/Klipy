const { app, BrowserWindow, dialog, ipcMain, protocol, session } = require('electron');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { scheme, rendererUrl: productionUrl, rendererSession, devUrl, configureRenderer } = require('./renderer-security');
const { validate, validateClipboard } = require('./ipc-validation');
const { createBackendClient } = require('./backend-client');

const root = path.resolve(__dirname, '../..');
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');
const isDev = !app.isPackaged && process.env.AUTHENTICATOR_DEV_URL === devUrl;
const rendererUrl = isDev ? devUrl : productionUrl;
const backend = createBackendClient(root, {
  allowSource: isDev,
  backendDir: app.isPackaged ? path.join(process.resourcesPath, 'backend') : undefined,
});
app.setAppUserModelId('io.github.luomuqaq.klipy');
let mainWindow;

protocol.registerSchemesAsPrivileged([{ scheme, privileges: { standard: true, secure: true } }]);

function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    const frame = event.senderFrame;
    if (event.sender !== mainWindow?.webContents || !frame || frame.parent || frame.url !== rendererUrl) {
      throw new Error('不允许此页面访问身份验证器接口。');
    }
    if (args.length > 1) throw new Error('请求参数无效。');
    return callback(...args);
  });
}

function registerIpc() {
  const actions = {
    list: 'list',
    add: 'add',
    addBatch: 'addbatch',
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
    copyCode: 'copycode',
  };
  for (const [channel, action] of Object.entries(actions)) {
    handle(`authenticator:${channel}`, (params) => {
      validate(channel, params);
      return backend.request(action, params);
    });
  }

  handle('authenticator:copy', (text) => {
    validateClipboard(text);
    return backend.request('copyprivate', { text });
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

  const partition = session.fromPartition(rendererSession);
  await configureRenderer(partition, dist, isDev);
  await backend.request('ping');

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
    icon: path.join(dist, 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: isDev,
      session: partition,
    },
  });
  mainWindow = win;

  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const name of ['will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
    win.webContents.on(name, (event) => event.preventDefault());
  }
  partition.on('will-download', (event, item, contents) => {
    // Allow only the existing local PNG export, never file or remote downloads.
    if (contents !== win.webContents || !item.getURL().startsWith('data:image/png;base64,') ||
        !item.getFilename().toLowerCase().endsWith('.png')) event.preventDefault();
  });
  win.on('closed', () => { mainWindow = undefined; });
  for (const event of ['maximize', 'unmaximize']) {
    win.on(event, () => win.webContents.send('window:maximized-changed', win.isMaximized()));
  }
  win.once('ready-to-show', () => win.show());
  await win.loadURL(rendererUrl);
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
