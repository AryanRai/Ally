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
  getPlatform: () => ipcRenderer.invoke('system:get-platform'),
  
  // Context monitoring
  getClipboard: () => ipcRenderer.invoke('context:get-clipboard'),
  getSelectedText: () => ipcRenderer.invoke('context:get-selected-text'),
  startContextMonitoring: () => ipcRenderer.send('context:start-monitoring'),
  stopContextMonitoring: () => ipcRenderer.send('context:stop-monitoring'),
  
  // Listen for clipboard changes
  onClipboardChanged: (callback: (data: { text: string; timestamp: number }) => void) => {
    const handler = (_: any, data: { text: string; timestamp: number }) => callback(data);
    ipcRenderer.on('context:clipboard-changed', handler);
    return () => ipcRenderer.removeListener('context:clipboard-changed', handler);
  },
  
  // Theme management
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (theme: 'light' | 'dark') => ipcRenderer.send('theme:set', theme),
  onThemeChanged: (callback: (theme: 'light' | 'dark') => void) => {
    const handler = (_: any, theme: 'light' | 'dark') => callback(theme);
    ipcRenderer.on('theme:changed', handler);
    return () => ipcRenderer.removeListener('theme:changed', handler);
  },

  // Ollama API
  ollama: {
    isAvailable: () => ipcRenderer.invoke('ollama:isAvailable'),
    getModels: () => ipcRenderer.invoke('ollama:getModels'),
    chat: (messages: any[], model?: string, onProgress?: (chunk: any) => void) => {
      if (onProgress) {
        // Set up streaming listener
        const handler = (_: any, chunk: any) => onProgress(chunk);
        ipcRenderer.on('ollama:streaming-chunk', handler);
        
        // Return promise that resolves when chat completes
        return ipcRenderer.invoke('ollama:chat', messages, model).finally(() => {
          ipcRenderer.removeListener('ollama:streaming-chunk', handler);
        });
      }
      return ipcRenderer.invoke('ollama:chat', messages, model);
    },
    getConfig: () => ipcRenderer.invoke('ollama:getConfig'),
    updateConfig: (config: any) => ipcRenderer.send('ollama:updateConfig', config)
  },

  // Server status
  server: {
    getStatus: () => ipcRenderer.invoke('server:getStatus'),
    checkStatus: () => ipcRenderer.invoke('server:checkStatus'),
    updateConfig: (config: any) => ipcRenderer.send('server:updateConfig', config)
  },

  // System commands
  system: {
    executeCommand: (command: string) => ipcRenderer.invoke('system:executeCommand', command)
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('pip', pipAPI);

// Add type declarations for TypeScript
export type PipAPI = typeof pipAPI;