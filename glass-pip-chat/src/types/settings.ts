export interface UISettings {
  fontSize: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  messageSpacing: 'compact' | 'normal' | 'comfortable';
  messagePadding: 'tight' | 'normal' | 'spacious';
  windowPadding: number; // 0-32px padding around the chat container
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export interface ToolSettings {
  enabled: boolean;
  autoConnect: boolean;
  streamHandlerUrl: string;
}

export interface AppSettings {
  ui: UISettings;
  theme: 'light' | 'dark';
  contextToggleEnabled: boolean;
  tools?: ToolSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ui: {
    fontSize: 'sm',
    messageSpacing: 'normal',
    messagePadding: 'normal',
    windowPadding: 8,
    borderRadius: '2xl'
  },
  theme: 'dark',
  contextToggleEnabled: true,
  tools: {
    enabled: false,
    autoConnect: true,
    streamHandlerUrl: 'ws://localhost:3000'
  }
};