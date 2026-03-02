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
    updateConfig: (config: any) => ipcRenderer.send('ollama:updateConfig', config),
    
    // Provider management
    getProviders: () => ipcRenderer.invoke('ollama:getProviders'),
    setProvider: (provider: 'ollama' | 'openrouter' | 'gemini') => ipcRenderer.send('ollama:setProvider', provider),
    
    // OpenRouter specific methods
    getOpenRouterModels: () => ipcRenderer.invoke('ollama:getOpenRouterModels'),
    isOpenRouterAvailable: () => ipcRenderer.invoke('ollama:isOpenRouterAvailable'),
    testOpenRouterConnection: () => ipcRenderer.invoke('ollama:testOpenRouterConnection'),
    openRouterStreamChat: async (messages: any[], model: string, onProgress: (chunk: string) => void) => {
      // Set up listener for progress updates
      const progressHandler = (_: any, chunk: string) => onProgress(chunk);
      ipcRenderer.on('ollama:openRouterProgress', progressHandler);
      
      try {
        // Start the streaming request
        const result = await ipcRenderer.invoke('ollama:openRouterStreamChat', messages, model);
        return result;
      } finally {
        // Clean up the listener
        ipcRenderer.removeListener('ollama:openRouterProgress', progressHandler);
      }
    },
    
    // Gemini specific methods
    getGeminiModels: () => ipcRenderer.invoke('ollama:getGeminiModels'),
    isGeminiAvailable: () => ipcRenderer.invoke('ollama:isGeminiAvailable'),
    testGeminiConnection: () => ipcRenderer.invoke('ollama:testGeminiConnection')
  },

  // Server status
  server: {
    getStatus: () => ipcRenderer.invoke('server:getStatus'),
    checkStatus: () => ipcRenderer.invoke('server:checkStatus'),
    updateConfig: (config: any) => ipcRenderer.send('server:updateConfig', config)
  },

  // System commands
  system: {
    executeCommand: (command: string) => ipcRenderer.invoke('system:executeCommand', command),
    fetchUrl: (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string }) =>
      ipcRenderer.invoke('system:fetchUrl', url, options),
  },

  // Browser bridge — talks to Ally Chrome extension
  browser: {
    callTool: (tool: string, params: Record<string, unknown>) =>
      ipcRenderer.invoke('browser:callTool', tool, params),
    isConnected: () => ipcRenderer.invoke('browser:isConnected'),
  },

  // Speech service
  speech: {
    connect: () => ipcRenderer.invoke('speech:connect'),
    disconnect: () => ipcRenderer.invoke('speech:disconnect'),
    isConnected: () => ipcRenderer.invoke('speech:isConnected'),
    startListening: () => ipcRenderer.invoke('speech:startListening'),
    stopListening: () => ipcRenderer.invoke('speech:stopListening'),
    synthesize: (text: string) => ipcRenderer.invoke('speech:synthesize', text),
    synthesizeStreaming: (text: string) => ipcRenderer.invoke('speech:synthesizeStreaming', text),
    sendGGWave: (text: string) => ipcRenderer.invoke('speech:sendGGWave', text),
    getStatus: () => ipcRenderer.invoke('speech:getStatus'),
    clearTTSQueue: () => ipcRenderer.invoke('speech:clearTTSQueue'),
    getTTSQueueStatus: () => ipcRenderer.invoke('speech:getTTSQueueStatus'),
    skipCurrentTTS: () => ipcRenderer.invoke('speech:skipCurrentTTS'),
    
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
    },
    
    // Streaming TTS events
    onTTSStreamStart: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('speech:ttsStreamStart', handler);
      return () => ipcRenderer.removeListener('speech:ttsStreamStart', handler);
    },
    onTTSStreamChunk: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('speech:ttsStreamChunk', handler);
      return () => ipcRenderer.removeListener('speech:ttsStreamChunk', handler);
    },
    onTTSStreamComplete: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('speech:ttsStreamComplete', handler);
      return () => ipcRenderer.removeListener('speech:ttsStreamComplete', handler);
    },
    onTTSStreamError: (callback: (error: string) => void) => {
      const handler = (_: any, error: string) => callback(error);
      ipcRenderer.on('speech:ttsStreamError', handler);
      return () => ipcRenderer.removeListener('speech:ttsStreamError', handler);
    }
  },

  // Listen for speech toggle event
  onToggleSpeech: (callback: () => void) => {
    ipcRenderer.on('toggle-speech', callback);
    return () => ipcRenderer.removeListener('toggle-speech', callback);
  },

  // MCP/ACP Integration
  mcp: {
    readConfig: () => ipcRenderer.invoke('mcp:readConfig'),
    writeConfig: (config: any) => ipcRenderer.invoke('mcp:writeConfig', config),
    spawnServer: (config: any) => ipcRenderer.invoke('mcp:spawnServer', config),
    sendMessage: (processId: string, message: string) => ipcRenderer.invoke('mcp:sendMessage', processId, message),
    killServer: (processId: string) => ipcRenderer.invoke('mcp:killServer', processId),
    getServerStatus: () => ipcRenderer.invoke('mcp:getServerStatus'),
    restartServer: (serverName: string) => ipcRenderer.invoke('mcp:restartServer', serverName),
    executeTool: (toolName: string, parameters: any) => ipcRenderer.invoke('mcp:executeTool', toolName, parameters),
    
    // Event listeners for MCP server events
    onServerData: (callback: (data: { processId: string; data: string }) => void) => {
      const handler = (_: any, data: { processId: string; data: string }) => callback(data);
      ipcRenderer.on('mcp:serverData', handler);
      return () => ipcRenderer.removeListener('mcp:serverData', handler);
    },
    onServerError: (callback: (data: { processId: string; error: string }) => void) => {
      const handler = (_: any, data: { processId: string; error: string }) => callback(data);
      ipcRenderer.on('mcp:serverError', handler);
      return () => ipcRenderer.removeListener('mcp:serverError', handler);
    },
    onServerExit: (callback: (data: { processId: string; code: number; signal: string }) => void) => {
      const handler = (_: any, data: { processId: string; code: number; signal: string }) => callback(data);
      ipcRenderer.on('mcp:serverExit', handler);
      return () => ipcRenderer.removeListener('mcp:serverExit', handler);
    }
  },

  acp: {
    readConfig: () => ipcRenderer.invoke('acp:readConfig'),
    writeConfig: (config: any) => ipcRenderer.invoke('acp:writeConfig', config),
    getAgentStatus: () => ipcRenderer.invoke('acp:getAgentStatus'),
    queryAgent: (agentId: string, query: string, context?: any) => ipcRenderer.invoke('acp:queryAgent', agentId, query, context),
    reconnectAgent: (agentId: string) => ipcRenderer.invoke('acp:reconnectAgent', agentId)
  },

  // Accessibility service
  accessibility: {
    connect: () => ipcRenderer.invoke('accessibility:connect'),
    disconnect: () => ipcRenderer.invoke('accessibility:disconnect'),
    isConnected: () => ipcRenderer.invoke('accessibility:isConnected'),
    getSelectedText: () => ipcRenderer.invoke('accessibility:getSelectedText'),
    getElementAtCursor: () => ipcRenderer.invoke('accessibility:getElementAtCursor'),
    getFocusedElement: () => ipcRenderer.invoke('accessibility:getFocusedElement'),
    getCursorPosition: () => ipcRenderer.invoke('accessibility:getCursorPosition'),
    getActiveWindow: () => ipcRenderer.invoke('accessibility:getActiveWindow'),
    getScreenContent: () => ipcRenderer.invoke('accessibility:getScreenContent'),
    
    // Listen for accessibility context updates
    onContextUpdate: (callback: (context: any) => void) => {
      const handler = (_: any, context: any) => callback(context);
      ipcRenderer.on('accessibility-context-update', handler);
      return () => ipcRenderer.removeListener('accessibility-context-update', handler);
    }
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('pip', pipAPI);

// Add type declarations for TypeScript
export type PipAPI = typeof pipAPI;