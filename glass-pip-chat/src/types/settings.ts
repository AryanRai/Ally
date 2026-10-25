export interface UISettings {
  fontSize: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  messageSpacing: 'compact' | 'normal' | 'comfortable';
  messagePadding: 'tight' | 'normal' | 'spacious';
  windowPadding: number; // 0-32px padding around the chat container
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export interface AppSettings {
  ui: UISettings;
  theme: 'light' | 'dark';
  contextToggleEnabled: boolean;
  /** Pill ↔ notch behaviour shared by both surfaces. */
  notch?: NotchSettings;
}

export interface NotchSettings {
  /** Mirror the running reply into the docked notch. */
  livePreview: boolean;
  /** Show Ally's greeting when the pill docks into the notch. */
  greetOnDock: boolean;
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
  notch: { livePreview: true, greetOnDock: true },
};
