import { contextBridge, ipcRenderer } from 'electron';
import type { AgentProvider } from './agent/types';

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
  captureQueryScreen: () => ipcRenderer.invoke('context:query-screen'),
  onManualResize: (callback: (size: { width: number; height: number }) => void) => {
    const handler = (_: unknown, size: { width: number; height: number }) => callback(size);
    ipcRenderer.on('window:manual-resize', handler);
    return () => ipcRenderer.removeListener('window:manual-resize', handler);
  },
  openLocalDocument: (file: string) => ipcRenderer.invoke('document:open', file),
  readVisualization: (file: string) => ipcRenderer.invoke('document:visualization', file),
  
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
  onSurfaceFloat: (callback: (id: number) => void) => {
    const handler = (_: unknown, id: number) => callback(id);
    ipcRenderer.on('surface:float', handler);
    return () => ipcRenderer.removeListener('surface:float', handler);
  },
  surfaceReady: (id: number) => ipcRenderer.send('surface:ready', id),
  surfacePreview: (value: unknown) => ipcRenderer.send('surface:preview', value),
  nativeSettings: (change?: { key: string; value: string | number | boolean }) => ipcRenderer.invoke('surface:native-settings', change),

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
    settings: () => ipcRenderer.invoke('speech:settings'),
    saveSettings: (patch: unknown) => ipcRenderer.invoke('speech:saveSettings', patch),
    liveStart: (id: string) => ipcRenderer.send('speech:liveStart', id),
    liveAudio: (id: string, bytes: Uint8Array) => ipcRenderer.send('speech:liveAudio', id, bytes),
    liveEnd: (id: string, cancel = false) => ipcRenderer.send('speech:liveEnd', id, cancel),
    streamVoice: (id: string, text: string, name?: string) => ipcRenderer.invoke('speech:streamVoice', id, text, name),
    streamCancel: () => ipcRenderer.send('speech:streamCancel'),
    onLiveEvent: (callback: (event: unknown) => void) => {
      const handler = (_: unknown, event: unknown) => callback(event);
      ipcRenderer.on('speech:liveEvent', handler);
      return () => ipcRenderer.removeListener('speech:liveEvent', handler);
    },
    connect: () => ipcRenderer.invoke('speech:connect'),
    getStatus: () => ipcRenderer.invoke('speech:getStatus'),
    voices: () => ipcRenderer.invoke('speech:voices'),
    cloudVoices: () => ipcRenderer.invoke('speech:cloudVoices'),
    transcribe: (bytes: Uint8Array) => ipcRenderer.invoke('speech:transcribe', bytes),
    synthesize: (text: string, options?: { voice?: string; rate?: number; volume?: number; engine?: 'local' | 'google'; cloudVoice?: string }) => ipcRenderer.invoke('speech:synthesize', text, options),
    cancel: () => ipcRenderer.invoke('speech:cancel'),
  },

  // Listen for speech toggle event
  notifyReply: (notice: unknown) => ipcRenderer.send('reply:notify', notice),
  onReplyOpen: (callback: (notice: any) => void) => {
    const handler = (_: unknown, notice: any) => callback(notice);
    ipcRenderer.on('reply:open', handler);
    return () => ipcRenderer.removeListener('reply:open', handler);
  },
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
    selectionState: () => ipcRenderer.invoke('circle:selection-state'),
    selectionAction: (action: string) => ipcRenderer.invoke('circle:selection-action', action),
    onSelection: (callback: (state: unknown) => void) => {
      const handler = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on('circle:selection', handler);
      return () => ipcRenderer.removeListener('circle:selection', handler);
    },
    start: () => ipcRenderer.invoke('circle:start'),
    setChat: (chatId?: string, title?: string) => ipcRenderer.invoke('circle:chat', chatId, title),
    getShot: () => ipcRenderer.invoke('circle:getShot'),
    context: () => ipcRenderer.invoke('circle:context'),
    submit: (payload: import('./capture/types').CircleSubmit) =>
      ipcRenderer.invoke('circle:submit', payload),
    cancel: () => ipcRenderer.invoke('circle:cancel'),
    onAsk: (callback: (ask: import('./capture/types').CircleAsk) => void) => {
      const handler = (_: any, ask: import('./capture/types').CircleAsk) => callback(ask);
      ipcRenderer.on('circle:ask', handler);
      return () => ipcRenderer.removeListener('circle:ask', handler);
    },
  },

  tutor: {
    action: (id: string, action: import('./visualTutor/types').TutorAction) => ipcRenderer.invoke('tutor:action', id, action),
    show: (id: string, point?: { x: number; y: number }) => ipcRenderer.invoke('tutor:show', id, point),
    start: (chatId: string, displayId?: number, circleCaptureId?: string) => ipcRenderer.invoke('tutor:start', chatId, displayId, circleCaptureId),
    displays: () => ipcRenderer.invoke('tutor:displays'),
    state: () => ipcRenderer.invoke('tutor:state'),
    end: (id: string) => ipcRenderer.invoke('tutor:end', id),
    onChanged: (callback: (board: unknown) => void) => {
      const handler = (_: unknown, board: unknown) => callback(board);
      ipcRenderer.on('tutor:changed', handler);
      return () => ipcRenderer.removeListener('tutor:changed', handler);
    },
  },

  // Claude Code / Codex agent backends
  agent: {
    queue: (key: string) => ipcRenderer.invoke('agent:queue', key),
    queueChange: (key: string, change: import('./agent/messageQueueTypes.js').QueueChange) => ipcRenderer.invoke('agent:queueChange', key, change),
    status: () => ipcRenderer.invoke('agent:status'),
    getConfig: () => ipcRenderer.invoke('agent:getConfig'),
    updateConfig: (patch: Record<string, unknown>) => ipcRenderer.invoke('agent:updateConfig', patch),
    listModels: (provider: 'claude' | 'codex') => ipcRenderer.invoke('agent:listModels', provider),
    greeting: (provider: 'claude' | 'codex', model: string) => ipcRenderer.invoke('agent:greeting', provider, model),
    send: (opts: Record<string, unknown>) => ipcRenderer.invoke('agent:send', opts),
    localImage: (source: string) => ipcRenderer.invoke('agent:localImage', source),
    interactionHistory: (chatId: string) => ipcRenderer.invoke('agent:interactionHistory', chatId),
    answerInteraction: (chatId: string, id: string, answer: import('./watch/approvals').ApprovalAnswer) => ipcRenderer.invoke('agent:answerInteraction', chatId, id, answer),
    onInteractionsChanged: (callback: () => void) => {
      const handler = () => callback(); ipcRenderer.on('agent:interactionsChanged', handler);
      return () => ipcRenderer.removeListener('agent:interactionsChanged', handler);
    },
    sessionInput: (provider: AgentProvider, sessionId: string, text: string, requestId: string, mode: 'steer' | 'queue') => ipcRenderer.invoke('agent:sessionInput', provider, sessionId, text, requestId, mode),
    steer: (runId: string, text: string, requestId: string, mode?: 'auto' | 'steer' | 'queue') => ipcRenderer.invoke('agent:steer', runId, text, requestId, mode),
    stopSession: (provider: AgentProvider, id: string) => ipcRenderer.invoke('agent:stopSession', provider, id),
    stop: (runId: string) => ipcRenderer.invoke('agent:stop', runId),
    activity: () => ipcRenderer.invoke('agent:activity'),
    runningSessions: () => ipcRenderer.invoke('agent:runningSessions'),
    listSessions: (provider: 'claude' | 'codex', limit?: number) => ipcRenderer.invoke('agent:listSessions', provider, limit),
    listSessionsPage: (provider: 'claude' | 'codex', cursor?: string) => ipcRenderer.invoke('agent:listSessionsPage', provider, cursor),
    getSelection: () => ipcRenderer.invoke('agent:getSelection'),
    setSelection: (selected: import('./agent/selection').SharedChatSelection | null, version: string) => ipcRenderer.invoke('agent:setSelection', selected, version),
    onSelection: (callback: (state: import('./agent/selection').SelectionSnapshot) => void) => {
      const handler = (_: unknown, state: import('./agent/selection').SelectionSnapshot) => callback(state);
      ipcRenderer.on('agent:selection', handler);
      return () => { ipcRenderer.removeListener('agent:selection', handler); };
    },
    loadSession: (provider: 'claude' | 'codex', id: string, revision?: string) => ipcRenderer.invoke('agent:loadSession', provider, id, revision),
    readStates: (keys?: string[]) => ipcRenderer.invoke('agent:readStates', keys),
    markRead: (provider: 'claude' | 'codex', id: string, revision: string) => ipcRenderer.invoke('agent:markRead', provider, id, revision),
    onSessionsChanged: (callback: (provider: 'claude' | 'codex') => void) => {
      const handler = (_: any, provider: 'claude' | 'codex') => callback(provider);
      ipcRenderer.on('agent:sessionsChanged', handler);
      return () => ipcRenderer.removeListener('agent:sessionsChanged', handler);
    },
    pickFolder: (current?: string) => ipcRenderer.invoke('agent:pickFolder', current),
    // Claude Code sign-in (drives `claude auth login`)
    claudeAccount: () => ipcRenderer.invoke('claude:account'),
    claudeLogin: {
      start: () => ipcRenderer.invoke('claude:loginStart'),
      onEvent: (callback: (event: any) => void) => {
        const handler = (_: any, event: any) => callback(event);
        ipcRenderer.on('claude:loginEvent', handler);
        return () => ipcRenderer.removeListener('claude:loginEvent', handler);
      },
    },
    onEvent: (callback: (data: { runId: string; event: any }) => void) => {
      const handler = (_: any, data: { runId: string; event: any }) => callback(data);
      ipcRenderer.on('agent:event', handler);
      return () => ipcRenderer.removeListener('agent:event', handler);
    },
  },

  // ally-chats MCP server: cross-chat find / read / forward for every agent
  chatsMcp: {
    status: () => ipcRenderer.invoke('chatsMcp:status'),
    appStatus: () => ipcRenderer.invoke('chatsMcp:appStatus'),
    addToApps: () => ipcRenderer.invoke('chatsMcp:addToApps'),
    removeFromApps: () => ipcRenderer.invoke('chatsMcp:removeFromApps'),
    onOpenChat: (callback: (req: { provider: 'claude' | 'codex'; sessionId: string; title: string; cwd?: string }) => void) => {
      const handler = (_: any, req: any) => callback(req);
      ipcRenderer.on('chats:open', handler);
      return () => ipcRenderer.removeListener('chats:open', handler);
    },
  },

  // Realtime perception sessions (electron/perception)
  perception: {
    status: () => ipcRenderer.invoke('perception:status'),
    cards: () => ipcRenderer.invoke('perception:cards'),
    recent: (ms: number) => ipcRenderer.invoke('perception:recent', ms),
    context: (ms?: number) => ipcRenderer.invoke('perception:context', ms),
    start: (opts: Record<string, unknown>) => ipcRenderer.invoke('perception:start', opts),
    pause: () => ipcRenderer.invoke('perception:pause'),
    resume: () => ipcRenderer.invoke('perception:resume'),
    stop: () => ipcRenderer.invoke('perception:stop'),
    setMode: (mode: string) => ipcRenderer.invoke('perception:setMode', mode),
    setCapture: (patch: Record<string, boolean>) => ipcRenderer.invoke('perception:setCapture', patch),
    setQuiet: (quiet: boolean) => ipcRenderer.invoke('perception:setQuiet', quiet),
    fork: () => ipcRenderer.invoke('perception:fork'),
    ask: (question: string, contextMs?: number) => ipcRenderer.invoke('perception:ask', question, contextMs),
    stopTurn: () => ipcRenderer.invoke('perception:stopTurn'),
    dismiss: (id: string) => ipcRenderer.invoke('perception:dismiss', id),
    getSettings: () => ipcRenderer.invoke('perception:getSettings'),
    updateSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('perception:updateSettings', patch),
    audioBegin: (source: string, id: string) => ipcRenderer.send('perception:audioBegin', source, id),
    audioChunk: (id: string, pcm: ArrayBuffer) => ipcRenderer.send('perception:audioChunk', id, pcm),
    audioEnd: (source: string, id: string) => ipcRenderer.send('perception:audioEnd', source, id),
    audioError: (source: string, message: string) => ipcRenderer.send('perception:audioError', source, message),
    onEvent: (callback: (push: any) => void) => {
      const handler = (_: any, push: any) => callback(push);
      ipcRenderer.on('perception:event', handler);
      return () => ipcRenderer.removeListener('perception:event', handler);
    },
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('pip', pipAPI);

// Add type declarations for TypeScript
export type PipAPI = typeof pipAPI;
