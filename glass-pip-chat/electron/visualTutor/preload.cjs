const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tutor', {
  onPillBounds: callback => {
    const handler = (_, bounds) => callback(bounds);
    ipcRenderer.on('tutor:pill-bounds', handler);
    return () => ipcRenderer.removeListener('tutor:pill-bounds', handler);
  },
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
