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

  // Speech: audio capture remains explicit in the renderer; credentials stay in main.
  speech: {
    connect: () => ipcRenderer.invoke('speech:connect'),
    getStatus: () => ipcRenderer.invoke('speech:getStatus'),
    voices: () => ipcRenderer.invoke('speech:voices'),
    cloudVoices: () => ipcRenderer.invoke('speech:cloudVoices'),
    transcribe: (bytes: Uint8Array) => ipcRenderer.invoke('speech:transcribe', bytes),
    synthesize: (text: string, options?: { voice?: string; rate?: number; volume?: number; engine?: 'local' | 'google'; cloudVoice?: string }) => ipcRenderer.invoke('speech:synthesize', text, options),
    cancel: () => ipcRenderer.invoke('speech:cancel'),
  },

  // Listen for speech toggle event
  onToggleSpeech: (callback: () => void) => {
    ipcRenderer.on('toggle-speech', callback);
    return () => ipcRenderer.removeListener('toggle-speech', callback);
  },

  // Global hotkey events from the main process (see SHORTCUTS in main.ts)
  onShortcut: (callback: (event: 'focus-main-input' | 'show-collapsed-and-focus-quick' | 'toggle-collapse' | 'cycle-size' | 'toggle-context') => void) => {
    const events = ['focus-main-input', 'show-collapsed-and-focus-quick', 'toggle-collapse', 'cycle-size', 'toggle-context'] as const;
    const handlers = events.map(name => {
      const handler = () => callback(name);
      ipcRenderer.on(name, handler);
      return [name, handler] as const;
    });
    return () => handlers.forEach(([name, handler]) => ipcRenderer.removeListener(name, handler));
  },


  // Global cursor feed for the robot's eyes
  watchCursor: (on: boolean) => ipcRenderer.send('cursor:watch', on),
  onCursorMoved: (callback: (pos: { x: number; y: number }) => void) => {
    const handler = (_: any, pos: { x: number; y: number }) => callback(pos);
    ipcRenderer.on('cursor:moved', handler);
    return () => ipcRenderer.removeListener('cursor:moved', handler);
  },

  // Circle to Ask (overlay page + the chat window that receives the result)
  circle: {
    start: () => ipcRenderer.invoke('circle:start'),
    getShot: () => ipcRenderer.invoke('circle:getShot'),
    submit: (payload: { rect?: { x: number; y: number; width: number; height: number }; prompt: string }) =>
      ipcRenderer.invoke('circle:submit', payload),
    cancel: () => ipcRenderer.invoke('circle:cancel'),
    onAsk: (callback: (ask: { imagePath: string; thumbnail: string; prompt: string }) => void) => {
      const handler = (_: any, ask: { imagePath: string; thumbnail: string; prompt: string }) => callback(ask);
      ipcRenderer.on('circle:ask', handler);
      return () => ipcRenderer.removeListener('circle:ask', handler);
    },
  },

  // Claude Code / Codex agent backends
  agent: {
    status: () => ipcRenderer.invoke('agent:status'),
    getConfig: () => ipcRenderer.invoke('agent:getConfig'),
    updateConfig: (patch: Record<string, unknown>) => ipcRenderer.invoke('agent:updateConfig', patch),
    listModels: (provider: 'claude' | 'codex') => ipcRenderer.invoke('agent:listModels', provider),
    greeting: (provider: 'claude' | 'codex', model: string) => ipcRenderer.invoke('agent:greeting', provider, model),
    send: (opts: Record<string, unknown>) => ipcRenderer.invoke('agent:send', opts),
    stop: (runId: string) => ipcRenderer.invoke('agent:stop', runId),
    listSessions: (provider: 'claude' | 'codex', limit?: number) => ipcRenderer.invoke('agent:listSessions', provider, limit),
    loadSession: (provider: 'claude' | 'codex', id: string, revision?: string) => ipcRenderer.invoke('agent:loadSession', provider, id, revision),
    onSessionsChanged: (callback: (provider: 'claude' | 'codex') => void) => {
      const handler = (_: any, provider: 'claude' | 'codex') => callback(provider);
      ipcRenderer.on('agent:sessionsChanged', handler);
      return () => ipcRenderer.removeListener('agent:sessionsChanged', handler);
    },
    pickFolder: (current?: string) => ipcRenderer.invoke('agent:pickFolder', current),
    onEvent: (callback: (data: { runId: string; event: any }) => void) => {
      const handler = (_: any, data: { runId: string; event: any }) => callback(data);
      ipcRenderer.on('agent:event', handler);
      return () => ipcRenderer.removeListener('agent:event', handler);
    },
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('pip', pipAPI);

// Add type declarations for TypeScript
export type PipAPI = typeof pipAPI;
