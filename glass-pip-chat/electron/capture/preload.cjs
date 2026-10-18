const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pip', { circle: {
  getShot: () => ipcRenderer.invoke('circle:getShot'),
  context: () => ipcRenderer.invoke('circle:context'),
  updateSelection: state => ipcRenderer.invoke('circle:selection-update', state),
  onSelectionAction: callback => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('circle:selection-action', handler);
    return () => ipcRenderer.removeListener('circle:selection-action', handler);
  },
  submit: payload => ipcRenderer.invoke('circle:submit', payload),
  cancel: () => ipcRenderer.invoke('circle:cancel'),
} });
