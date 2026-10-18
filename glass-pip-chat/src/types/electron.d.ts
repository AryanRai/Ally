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
    settings: () => Promise<import('../../electron/speech/settings').SpeechSettings>;
    saveSettings: (patch: Partial<import('../../electron/speech/settings').SpeechSettings>) => Promise<import('../../electron/speech/settings').SpeechSettings>;
    liveStart: (id: string) => void;
    liveAudio: (id: string, bytes: Uint8Array) => void;
    liveEnd: (id: string, cancel?: boolean) => void;
    streamVoice: (id: string, text: string, name?: string) => Promise<{ success: boolean; error?: string }>;
    streamCancel: () => void;
    onLiveEvent: (callback: (event: import('../../electron/speech/streaming').SpeechEvent) => void) => () => void;
    connect: () => Promise<{ success: boolean; error?: string }>;
    getStatus: () => Promise<{ ready: boolean; state: string; backend?: string; model?: string; error?: string }>;
    voices: () => Promise<{ success: boolean; voices?: string[]; error?: string }>;
    cloudVoices: () => Promise<{ success: boolean; voices?: Array<{ name: string; languageCodes: string[] }>; error?: string }>;
    transcribe: (bytes: Uint8Array) => Promise<{ success: boolean; text?: string; error?: string; status?: number }>;
    synthesize: (text: string, options?: { voice?: string; rate?: number; volume?: number; engine?: 'local' | 'google'; cloudVoice?: string }) => Promise<{ success: boolean; audio_data?: string; error?: string; warning?: string; provider?: string }>;
    cancel: () => Promise<{ success: boolean }>;
  };

  // Speech toggle event
  notifyReply: (notice: import('../../electron/notifications').ReplyNotice) => void;
  onReplyOpen: (callback: (notice: { chatId?: string; session?: AgentSessionSummary }) => void) => () => void;
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
    setChat: (chatId?: string, title?: string) => Promise<void>;
    /** Frozen screenshot for the overlay page (PNG data URL) */
    getShot: () => Promise<string | null>;
    context: () => Promise<import('../../electron/capture/types').CircleContext | null>;
    /** `rect` in overlay CSS pixels; omit to send the whole screen */
    submit: (payload: import('../../electron/capture/types').CircleSubmit) => Promise<void>;
    cancel: () => Promise<void>;
    onAsk: (callback: (ask: import('../../electron/capture/types').CircleAsk) => void) => () => void;
  };

  tutor: Pick<import('../../electron/visualTutor/types').VisualTutorApi, 'start' | 'displays' | 'state' | 'end' | 'show' | 'onChanged'>;

  // Claude Code / Codex agent backends
  agent: {
    queue: (key: string) => Promise<import('../../electron/agent/messageQueueTypes').QueueSnapshot>;
    queueChange: (key: string, change: import('../../electron/agent/messageQueueTypes').QueueChange) => Promise<import('../../electron/agent/messageQueueTypes').QueueSnapshot>;
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
    sessionInput: (provider: AgentProvider, sessionId: string, text: string, requestId: string, mode: 'steer' | 'queue') => Promise<'steered' | 'queued'>;
    steer: (runId: string, text: string, requestId: string, mode?: 'auto' | 'steer' | 'queue') => Promise<'steered' | 'queued'>;
    stop: (runId: string) => Promise<boolean>;
    runningSessions: () => Promise<AgentSessionSummary[]>;
    listSessions: (provider: AgentProvider, limit?: number) => Promise<AgentSessionSummary[]>;
    readStates: () => Promise<{ key: string; revision: string; unread: boolean }[]>;
    markRead: (provider: AgentProvider, id: string, revision: string) => Promise<boolean>;
    loadSession: (provider: AgentProvider, id: string, revision?: string) => Promise<import('../../electron/agent/types').AgentSessionSnapshot>;
    /** Claude Code sign-in state, verified with a real request */
    claudeAccount: () => Promise<import('../../electron/agent/claudeLogin').ClaudeAccount>;
    claudeLogin: {
      start: () => Promise<void>;
      onEvent: (callback: (event: import('../../electron/agent/claudeLogin').ClaudeLoginEvent) => void) => () => void;
    };
    onSessionsChanged: (callback: (provider: AgentProvider) => void) => () => void;
    pickFolder: (current?: string) => Promise<string | null>;
    onEvent: (callback: (data: { runId: string; event: AgentEvent }) => void) => () => void;
  };
  /** ally-chats MCP server (electron/chatsMcp) */
  chatsMcp: {
    status: () => Promise<{ running: boolean; port?: number; tools: string[]; indexed: number }>;
    /** null = that app isn't installed */
    appStatus: () => Promise<{ claude: boolean | null; codex: boolean | null }>;
    addToApps: () => Promise<{ claude: string; codex: string }>;
    removeFromApps: () => Promise<void>;
    onOpenChat: (callback: (req: { provider: AgentProvider; sessionId: string; title: string; cwd?: string }) => void) => () => void;
  };
  /** Realtime perception sessions (electron/perception) */
  perception: import('./perception').PerceptionApi;
}

declare global {
  interface Window {
    pip: PipAPI;
  }
}
