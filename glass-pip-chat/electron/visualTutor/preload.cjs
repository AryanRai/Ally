const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tutor', {
  review: (id,stepId) => ipcRenderer.invoke('tutor:review',id,stepId),
  controlPlayback: command => ipcRenderer.invoke('tutor:playback',command),
  loadNarration: (id,key) => ipcRenderer.invoke('tutor:narration',id,key),
  onPillBounds: callback => {
    const handler = (_, bounds) => callback(bounds);
    ipcRenderer.on('tutor:pill-bounds', handler);
    return () => ipcRenderer.removeListener('tutor:pill-bounds', handler);
  },
  cancelRender: (id, jobId) => ipcRenderer.invoke('tutor:manim-cancel', id, jobId),
  loadClip: (id, src) => ipcRenderer.invoke('tutor:manim-load', id, src),
  playbackAck: (command, state) => ipcRenderer.invoke('tutor:playback-ack', command, state),
  mediaState: state => ipcRenderer.send('tutor:media-state', state),
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
