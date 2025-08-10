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
}

declare global {
  interface Window {
    pip: PipAPI;
  }
}