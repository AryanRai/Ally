import { contextBridge, ipcRenderer } from 'electron';

// Define the API that will be exposed to the renderer
const pipAPI = {
  show: () => ipcRenderer.send('pip:show'),
  hide: () => ipcRenderer.send('pip:hide'),
  toggle: () => ipcRenderer.send('pip:toggle'),
  minimize: () => ipcRenderer.send('pip:minimize'),
  close: () => ipcRenderer.send('pip:close'),
  
  // Window resizing
  resizeWindow: (width: number, height: number) => ipcRenderer.send('window:resize', { width, height }),
  getWindowSize: () => ipcRenderer.invoke('window:get-size'),
  
  // Listen for resize completion
  onResizeComplete: (callback: (size: { width: number; height: number }) => void) => {
    const handler = (_: any, size: { width: number; height: number }) => callback(size);
    ipcRenderer.on('window:resize-complete', handler);
    return () => ipcRenderer.removeListener('window:resize-complete', handler);
  },
  
  // Listen for focus input event
  onFocusInput: (callback: () => void) => {
    ipcRenderer.on('focus-input', callback);
    return () => ipcRenderer.removeListener('focus-input', callback);
  },
  
  // Get platform info
  getPlatform: () => ipcRenderer.invoke('system:get-platform')
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('pip', pipAPI);

// Add type declarations for TypeScript
export type PipAPI = typeof pipAPI;