export interface UISettings {
  fontSize: 'xs' | 'sm' | 'base' | 'lg' | 'xl';
  messageSpacing: 'compact' | 'normal' | 'comfortable';
  messagePadding: 'tight' | 'normal' | 'spacious';
  windowPadding: number; // 0-32px padding around the chat container
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  /** What collapsing turns into: the floating robot or the compact quick-input pill */
  collapseStyle?: 'avatar' | 'pill';
}

export interface GreetingSettings {
  customGreeting: string;
  useRandomGreeting: boolean;
  randomGreetings: string[];
}

export interface AppSettings {
  ui: UISettings;
  theme: 'light' | 'dark';
  contextToggleEnabled: boolean;
  greeting?: GreetingSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ui: {
    fontSize: 'sm',
    messageSpacing: 'normal',
    messagePadding: 'normal',
    windowPadding: 8,
    borderRadius: '2xl',
    collapseStyle: 'avatar'
  },
  theme: 'dark',
  contextToggleEnabled: true,
  greeting: {
    customGreeting: 'Balalalala',
    useRandomGreeting: false,
    randomGreetings: [
      'Balalalala',
      'Beep boop!',
      'Ready to chat!',
      'What\'s on your mind?',
      'Hello there!',
      'Let\'s talk!',
      'How can I help?'
    ]
  }
};