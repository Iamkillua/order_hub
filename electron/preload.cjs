const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('orderHub', {
  getState: call('state:get'),
  saveCredentials: call('credentials:save'),
  signIn: call('auth:signIn'),
  cancelSignIn: call('auth:cancel'),
  signOut: call('auth:signOut'),
  inspectSheet: call('sheet:inspect'),
  previewTab: call('sheet:preview'),
  selectSheet: call('sheet:select'),
  clearSheet: call('sheet:clear'),
  saveSettings: call('settings:save'),
  loadOrders: call('orders:load'),
  setShipped: call('orders:setShipped'),
  loadNicknames: call('nicknames:load'),
  saveNicknames: call('nicknames:save'),
  openExternal: call('shell:open'),
  setTitlebar: (theme) => ipcRenderer.send('window:titlebar', theme),
  onFocus: (fn) => {
    const listener = () => fn();
    ipcRenderer.on('window:focus', listener);
    return () => ipcRenderer.removeListener('window:focus', listener);
  },
});
