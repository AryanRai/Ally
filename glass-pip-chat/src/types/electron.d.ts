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
    streamChatWithThinking: (messages: ChatMessage[], model: string, onProgress: (chunk: any) => void) => Promise<string>;
    stop: () => Promise<boolean>;
    
    // Provider management
    getProviders: () => Promise<Array<{ name: string; available: boolean; configured: boolean }>>;
    setProvider: (provider: 'ollama' | 'openrouter' | 'gemini') => void;
    
    // OpenRouter specific
    getOpenRouterModels: () => Promise<any[]>;
    isOpenRouterAvailable: () => Promise<boolean>;
    testOpenRouterConnection: () => Promise<{ success: boolean; error?: string }>;
    openRouterStreamChat: (messages: ChatMessage[], model: string, onProgress: (chunk: string) => void) => Promise<string>;
    
    // Gemini specific
    getGeminiModels: () => Promise<any[]>;
    isGeminiAvailable: () => Promise<boolean>;
    testGeminiConnection: () => Promise<{ success: boolean; error?: string }>;
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

  // MCP Integration
  mcp: {
    readConfig: () => Promise<any>;
    writeConfig: (config: any) => Promise<void>;
    spawnServer: (config: any) => Promise<{ processId: string }>;
    sendMessage: (processId: string, message: string) => Promise<void>;
    killServer: (processId: string) => Promise<void>;
    getServerStatus: () => Promise<Array<{ name: string; connected: boolean; toolCount: number }>>;
    restartServer: (serverName: string) => Promise<void>;
    executeTool: (toolName: string, parameters: any) => Promise<any>;
    
    onServerData: (callback: (data: { processId: string; data: string }) => void) => () => void;
    onServerError: (callback: (data: { processId: string; error: string }) => void) => () => void;
    onServerExit: (callback: (data: { processId: string; code: number; signal: string }) => void) => () => void;
  };

  // ACP Integration
  acp: {
    readConfig: () => Promise<any>;
    writeConfig: (config: any) => Promise<void>;
    getAgentStatus: () => Promise<any>;
    queryAgent: (agentId: string, query: string, context?: any) => Promise<any>;
    reconnectAgent: (agentId: string) => Promise<void>;
  };

  // Accessibility service
  accessibility?: {
    connect: () => Promise<{ success: boolean; error?: string }>;
    disconnect: () => Promise<{ success: boolean }>;
    isConnected: () => Promise<boolean>;
    getSelectedText: () => Promise<string>;
    getElementAtCursor: () => Promise<any>;
    getFocusedElement: () => Promise<any>;
    getCursorPosition: () => Promise<{ x: number; y: number }>;
    getActiveWindow: () => Promise<any>;
    getScreenContent: () => Promise<any>;
    onContextUpdate: (callback: (context: AccessibilityContext) => void) => () => void;
  };
}

export interface AccessibilityContext {
  selectedText?: string;
  focusedElement?: any;
  cursorPosition?: { x: number; y: number };
  activeWindow?: any;
}

declare global {
  interface Window {
    pip: PipAPI;
  }
}