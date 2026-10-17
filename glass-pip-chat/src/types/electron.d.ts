import type { AgentProvider, AgentPermission, AgentConfig, AgentModel, AgentSessionSummary, AgentEvent } from './agent';

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
    getStatus: () => Promise<{ ready: boolean; state: string; backend?: string; model?: string; error?: string }>;
    voices: () => Promise<{ success: boolean; voices?: string[]; error?: string }>;
    cloudVoices: () => Promise<{ success: boolean; voices?: Array<{ name: string; languageCodes: string[] }>; error?: string }>;
    transcribe: (bytes: Uint8Array) => Promise<{ success: boolean; text?: string; error?: string; status?: number }>;
    synthesize: (text: string, options?: { voice?: string; rate?: number; volume?: number; engine?: 'local' | 'google'; cloudVoice?: string }) => Promise<{ success: boolean; audio_data?: string; error?: string; warning?: string; provider?: string }>;
    cancel: () => Promise<{ success: boolean }>;
  };

  // Speech toggle event
  onToggleSpeech: (callback: () => void) => () => void;

  // Global hotkey events from the main process
  onShortcut: (callback: (event: 'focus-main-input' | 'show-collapsed-and-focus-quick' | 'toggle-collapse' | 'cycle-size' | 'toggle-context') => void) => () => void;

  // Robot eyes
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
    greeting: (provider: AgentProvider, model: string) => Promise<string>;
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
    loadSession: (provider: AgentProvider, id: string, revision?: string) => Promise<import('../../electron/agent/types').AgentSessionSnapshot>;
    onSessionsChanged: (callback: (provider: AgentProvider) => void) => () => void;
    pickFolder: (current?: string) => Promise<string | null>;
    onEvent: (callback: (data: { runId: string; event: AgentEvent }) => void) => () => void;
  };
}

declare global {
  interface Window {
    pip: PipAPI;
  }
}
