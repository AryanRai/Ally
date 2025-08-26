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
    chat: (messages: any[], model?: string) => ipcRenderer.invoke('ollama:chat', messages, model),
    streamChatWithThinking: async (messages: any[], model: string, onProgress: (chunk: any) => void) => {
      // Set up listener for progress updates
      const progressHandler = (_: any, chunk: any) => onProgress(chunk);
      ipcRenderer.on('ollama:streamProgress', progressHandler);
      
      try {
        // Start the streaming request
        const result = await ipcRenderer.invoke('ollama:streamChatWithThinking', messages, model);
        return result;
      } finally {
        // Clean up the listener
        ipcRenderer.removeListener('ollama:streamProgress', progressHandler);
      }
    },
    stop: () => ipcRenderer.invoke('ollama:stop'),
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
  },

  // Speech service
  speech: {
    connect: () => ipcRenderer.invoke('speech:connect'),
    disconnect: () => ipcRenderer.invoke('speech:disconnect'),
    isConnected: () => ipcRenderer.invoke('speech:isConnected'),
    startListening: () => ipcRenderer.invoke('speech:startListening'),
    stopListening: () => ipcRenderer.invoke('speech:stopListening'),
    synthesize: (text: string) => ipcRenderer.invoke('speech:synthesize', text),
    sendGGWave: (text: string) => ipcRenderer.invoke('speech:sendGGWave', text),
    getStatus: () => ipcRenderer.invoke('speech:getStatus'),
    
    // Event listeners
    onConnected: (callback: () => void) => {
      ipcRenderer.on('speech:connected', callback);
      return () => ipcRenderer.removeListener('speech:connected', callback);
    },
    onDisconnected: (callback: () => void) => {
      ipcRenderer.on('speech:disconnected', callback);
      return () => ipcRenderer.removeListener('speech:disconnected', callback);
    },
    onSpeechRecognized: (callback: (result: any) => void) => {
      const handler = (_: any, result: any) => callback(result);
      ipcRenderer.on('speech:recognized', handler);
      return () => ipcRenderer.removeListener('speech:recognized', handler);
    },
    onSpeechGenerated: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('speech:generated', handler);
      return () => ipcRenderer.removeListener('speech:generated', handler);
    },
    onSpeechError: (callback: (error: string) => void) => {
      const handler = (_: any, error: string) => callback(error);
      ipcRenderer.on('speech:error', handler);
      return () => ipcRenderer.removeListener('speech:error', handler);
    },
    onGGWaveSent: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('speech:ggwaveSent', handler);
      return () => ipcRenderer.removeListener('speech:ggwaveSent', handler);
    },
    onGGWaveError: (callback: (error: string) => void) => {
      const handler = (_: any, error: string) => callback(error);
      ipcRenderer.on('speech:ggwaveError', handler);
      return () => ipcRenderer.removeListener('speech:ggwaveError', handler);
    },
    onStatusUpdate: (callback: (status: any) => void) => {
      const handler = (_: any, status: any) => callback(status);
      ipcRenderer.on('speech:statusUpdate', handler);
      return () => ipcRenderer.removeListener('speech:statusUpdate', handler);
    },
    onListeningStarted: (callback: () => void) => {
      ipcRenderer.on('speech:listeningStarted', callback);
      return () => ipcRenderer.removeListener('speech:listeningStarted', callback);
    },
    onListeningStopped: (callback: () => void) => {
      ipcRenderer.on('speech:listeningStopped', callback);
      return () => ipcRenderer.removeListener('speech:listeningStopped', callback);
    }
  },

  // Listen for speech toggle event
  onToggleSpeech: (callback: () => void) => {
    ipcRenderer.on('toggle-speech', callback);
    return () => ipcRenderer.removeListener('toggle-speech', callback);
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('pip', pipAPI);

// Add type declarations for TypeScript
export type PipAPI = typeof pipAPI;