export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ServerStatus {
  ip: string;
  domain: string;
  status: 'online' | 'offline' | 'unknown';
  lastCheck: number;
  uptime?: number;
  load?: number;
}

export interface CommandResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

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

  // Ollama API
  ollama: {
    isAvailable: () => Promise<boolean>;
    getModels: () => Promise<OllamaModel[]>;
    chat: (messages: ChatMessage[], model?: string) => Promise<string>;
    getConfig: () => Promise<any>;
    updateConfig: (config: any) => void;
  };

  // Server status
  server: {
    getStatus: () => Promise<ServerStatus>;
    checkStatus: () => Promise<ServerStatus>;
    updateConfig: (config: Partial<ServerStatus>) => void;
  };

  // System commands
  system: {
    executeCommand: (command: string) => Promise<CommandResult>;
  };

  // Speech service
  speech: {
    connect: () => Promise<{ success: boolean; error?: string }>;
    disconnect: () => Promise<{ success: boolean; error?: string }>;
    isConnected: () => Promise<boolean>;
    startListening: () => Promise<{ success: boolean; error?: string }>;
    stopListening: () => Promise<{ success: boolean; error?: string }>;
    synthesize: (text: string) => Promise<{ success: boolean; error?: string }>;
    sendGGWave: (text: string) => Promise<{ success: boolean; error?: string }>;
    getStatus: () => Promise<{ success: boolean; error?: string }>;
    
    onConnected: (callback: () => void) => () => void;
    onDisconnected: (callback: () => void) => () => void;
    onSpeechRecognized: (callback: (result: any) => void) => () => void;
    onSpeechGenerated: (callback: (data: any) => void) => () => void;
    onSpeechError: (callback: (error: string) => void) => () => void;
    onGGWaveSent: (callback: (data: any) => void) => () => void;
    onGGWaveError: (callback: (error: string) => void) => () => void;
    onStatusUpdate: (callback: (status: any) => void) => () => void;
    onListeningStarted: (callback: () => void) => () => void;
    onListeningStopped: (callback: () => void) => () => void;
  };

  // Speech toggle event
  onToggleSpeech: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    pip: PipAPI;
  }
}