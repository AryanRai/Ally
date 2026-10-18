const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pip', { circle: {
  getShot: () => ipcRenderer.invoke('circle:getShot'),
  context: () => ipcRenderer.invoke('circle:context'),
  submit: payload => ipcRenderer.invoke('circle:submit', payload),
  cancel: () => ipcRenderer.invoke('circle:cancel'),
} });
