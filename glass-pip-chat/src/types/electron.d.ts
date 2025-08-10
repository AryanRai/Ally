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
}

declare global {
  interface Window {
    pip: PipAPI;
  }
}