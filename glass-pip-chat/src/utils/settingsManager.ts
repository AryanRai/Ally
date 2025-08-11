import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';

const SETTINGS_STORAGE_KEY = 'glass_pip_settings';

export class SettingsManager {
  private static instance: SettingsManager;
  private settings: AppSettings;
  private listeners: ((settings: AppSettings) => void)[] = [];

  private constructor() {
    this.settings = this.loadSettings();
  }

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  private loadSettings(): AppSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all properties exist
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          ui: {
            ...DEFAULT_SETTINGS.ui,
            ...parsed.ui
          }
        };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return DEFAULT_SETTINGS;
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<AppSettings>): void {
    this.settings = {
      ...this.settings,
      ...updates,
      ui: {
        ...this.settings.ui,
        ...updates.ui
      }
    };
    this.saveSettings();
  }

  updateUISettings(updates: Partial<AppSettings['ui']>): void {
    this.settings.ui = {
      ...this.settings.ui,
      ...updates
    };
    this.saveSettings();
  }

  subscribe(listener: (settings: AppSettings) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.settings));
  }

  // Utility methods for getting CSS classes
  getFontSizeClass(): string {
    const sizeMap = {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl'
    };
    return sizeMap[this.settings.ui.fontSize];
  }

  getMessageSpacingClass(): string {
    const spacingMap = {
      compact: 'space-y-2',
      normal: 'space-y-3',
      comfortable: 'space-y-4'
    };
    return spacingMap[this.settings.ui.messageSpacing];
  }

  getMessagePaddingClass(): string {
    const paddingMap = {
      tight: 'p-2',
      normal: 'p-4',
      spacious: 'p-6'
    };
    return paddingMap[this.settings.ui.messagePadding];
  }
}