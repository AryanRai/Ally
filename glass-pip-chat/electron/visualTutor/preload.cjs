const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tutor', {
  overlay: () => ipcRenderer.invoke('tutor:overlay'),
  action: (id, action) => ipcRenderer.invoke('tutor:action', id, action),
  sketch: (id, points) => ipcRenderer.invoke('tutor:sketch', id, points),
  interactive: on => ipcRenderer.send('tutor:interactive', on),
  onChanged: callback => {
    const handler = (_, board) => callback(board);
    ipcRenderer.on('tutor:changed', handler);
    return () => ipcRenderer.removeListener('tutor:changed', handler);
  },
});
