import type { AgentProvider, AgentPermission, AgentConfig, AgentModel, AgentSessionSummary, AgentHistoryMessage, AgentEvent } from './agent';

export interface PipAPI {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  minimize: () => void;
  close: () => void;
  
  // Window resizing
  resizeWindow: (width: number, height: number) => void;
  getWindowSize: () => Promise<{ width: number; height: number }>;
  
  // Listen for focus input event
  onFocusInput: (callback: () => void) => () => void;
  
  // Listen for resize completion
  onResizeComplete?: (callback: (size: { width: number; height: number }) => void) => () => void;
  
  // Get platform info
  getPlatform: () => Promise<string>;
  
  // Context monitoring
  getClipboard: () => Promise<string>;
  getSelectedText: () => Promise<string>;
  startContextMonitoring: () => void;
  stopContextMonitoring: () => void;
  onClipboardChanged: (callback: (data: { text: string; timestamp: number }) => void) => () => void;
  
  // Theme management
  getTheme: () => Promise<'light' | 'dark'>;
  setTheme: (theme: 'light' | 'dark') => void;
  onThemeChanged: (callback: (theme: 'light' | 'dark') => void) => () => void;

  // Speech service
  speech: {
    connect: () => Promise<{ success: boolean; error?: string }>;
    disconnect: () => Promise<{ success: boolean; error?: string }>;
    isConnected: () => Promise<boolean>;
    startListening: () => Promise<{ success: boolean; error?: string }>;
    stopListening: () => Promise<{ success: boolean; error?: string }>;
    synthesize: (text: string) => Promise<{ success: boolean; error?: string }>;
    synthesizeStreaming: (text: string) => Promise<{ success: boolean; error?: string }>;
    clearTTSQueue: () => Promise<{ success: boolean; error?: string }>;
    getTTSQueueStatus: () => Promise<any>;
    skipCurrentTTS: () => Promise<{ success: boolean; error?: string }>;
    sendGGWave: (text: string) => Promise<{ success: boolean; error?: string }>;
    getStatus: () => Promise<{ success: boolean; error?: string }>;
    
    onConnected: (callback: () => void) => () => void;
    onDisconnected: (callback: () => void) => () => void;
    onSpeechRecognized: (callback: (result: any) => void) => () => void;
    onSpeechInterim: (callback: (data: { text: string }) => void) => () => void;
    onSpeechInterrupted: (callback: () => void) => () => void;
    onSpeechGenerated: (callback: (data: any) => void) => () => void;
    onSpeechError: (callback: (error: string) => void) => () => void;
    onGGWaveSent: (callback: (data: any) => void) => () => void;
    onGGWaveError: (callback: (error: string) => void) => () => void;
    onStatusUpdate: (callback: (status: any) => void) => () => void;
    onListeningStarted: (callback: () => void) => () => void;
    onListeningStopped: (callback: () => void) => () => void;
    onTTSStreamStart: (callback: (data: any) => void) => () => void;
    onTTSStreamChunk: (callback: (data: any) => void) => () => void;
    onTTSStreamComplete: (callback: (data: any) => void) => () => void;
    onTTSStreamError: (callback: (error: string) => void) => () => void;
  };

  // Speech toggle event
  onToggleSpeech: (callback: () => void) => () => void;

  // Global hotkey events from the main process
  onShortcut: (callback: (event: 'focus-main-input' | 'show-collapsed-and-focus-quick' | 'toggle-collapse' | 'cycle-size' | 'toggle-context') => void) => () => void;

  // Avatar mode
  setAvatarMode: (on: boolean) => void;
  /** Start/stop the global cursor feed (window-relative coordinates) */
  watchCursor: (on: boolean) => void;
  onCursorMoved: (callback: (pos: { x: number; y: number }) => void) => () => void;

  // Circle to Ask
  circle: {
    start: () => Promise<void>;
    /** Frozen screenshot for the overlay page (PNG data URL) */
    getShot: () => Promise<string | null>;
    /** `rect` in overlay CSS pixels; omit to send the whole screen */
    submit: (payload: { rect?: { x: number; y: number; width: number; height: number }; prompt: string }) => Promise<void>;
    cancel: () => Promise<void>;
    onAsk: (callback: (ask: { imagePath: string; thumbnail: string; prompt: string }) => void) => () => void;
  };

  // Claude Code / Codex agent backends
  agent: {
    status: () => Promise<Record<AgentProvider, { available: boolean; path: string | null }>>;
    getConfig: () => Promise<AgentConfig>;
    updateConfig: (patch: Partial<AgentConfig>) => Promise<AgentConfig>;
    listModels: (provider: AgentProvider) => Promise<AgentModel[]>;
    send: (opts: {
      provider: AgentProvider;
      prompt: string;
      cwd?: string;
      sessionId?: string;
      model?: string;
      permission?: AgentPermission;
      /** Robot mode: persona instructions; the HowYouSeeMe MCP URL comes from agent config */
      robot?: { instructions: string };
      /** Image files shown to the agent (e.g. a circled screen region) */
      images?: string[];
    }) => Promise<string>;
    stop: (runId: string) => Promise<boolean>;
    listSessions: (provider: AgentProvider, limit?: number) => Promise<AgentSessionSummary[]>;
    loadSession: (provider: AgentProvider, id: string) => Promise<{ cwd?: string; messages: AgentHistoryMessage[] }>;
    pickFolder: (current?: string) => Promise<string | null>;
    onEvent: (callback: (data: { runId: string; event: AgentEvent }) => void) => () => void;
  };
}

declare global {
  interface Window {
    pip: PipAPI;
  }
}