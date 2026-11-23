const { contextBridge, ipcRenderer } = require('electron');

let locale = 'en';
try {
  const prefix = '--klipy-locale=';
  const arg = (process.argv || []).find((value) => value.startsWith(prefix));
  if (arg) locale = decodeURIComponent(arg.slice(prefix.length));
} catch {
  // Keep the English fallback when the renderer does not expose process.argv.
}

contextBridge.exposeInMainWorld('authenticatorAPI', {
  locale,
  listAccounts: () => ipcRenderer.invoke('authenticator:list'),
  addAccount: (params) => ipcRenderer.invoke('authenticator:add', params),
  addAccountsBatch: (params) => ipcRenderer.invoke('authenticator:addBatch', params),
  deleteAccount: (id) => ipcRenderer.invoke('authenticator:delete', { id }),
  updateAccount: (params) => ipcRenderer.invoke('authenticator:update', params),
  parseUri: (uri) => ipcRenderer.invoke('authenticator:parseUri', { uri }),
  parseMigration: (uri) => ipcRenderer.invoke('authenticator:parseMigration', { uri }),
  validateSecret: (secret) => ipcRenderer.invoke('authenticator:validateSecret', { secret }),
  listGroups: () => ipcRenderer.invoke('authenticator:groupList'),
  addGroup: (name) => ipcRenderer.invoke('authenticator:groupAdd', { name }),
  renameGroup: (id, name) => ipcRenderer.invoke('authenticator:groupRename', { id, name }),
  deleteGroup: (id) => ipcRenderer.invoke('authenticator:groupDelete', { id }),
  reorderGroups: (ids) => ipcRenderer.invoke('authenticator:groupReorder', { ids }),
  reorderAccounts: (ids) => ipcRenderer.invoke('authenticator:reorder', { ids }),
  exportAccount: (id) => ipcRenderer.invoke('authenticator:export', { id }),
  copyAccountCode: (id) => ipcRenderer.invoke('authenticator:copyCode', { id }),
  copyToClipboard: (text) => ipcRenderer.invoke('authenticator:copy', text),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window:maximized-changed', listener);
    return () => ipcRenderer.removeListener('window:maximized-changed', listener);
  },
});
