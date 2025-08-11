export interface UISettings {
  fontSize: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  messageSpacing: 'compact' | 'normal' | 'comfortable';
  messagePadding: 'tight' | 'normal' | 'spacious';
}

export interface AppSettings {
  ui: UISettings;
  theme: 'light' | 'dark';
  contextToggleEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ui: {
    fontSize: 'sm',
    messageSpacing: 'normal',
    messagePadding: 'normal'
  },
  theme: 'dark',
  contextToggleEnabled: true
};