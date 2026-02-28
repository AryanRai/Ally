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

export interface GreetingSettings {
  customGreeting: string;
  useRandomGreeting: boolean;
  randomGreetings: string[];
}

export interface NetworkSettings {
  enableSupabase: boolean;
  enableStreamHandler: boolean;
}

export interface AppSettings {
  ui: UISettings;
  theme: 'light' | 'dark';
  contextToggleEnabled: boolean;
  tools?: ToolSettings;
  greeting?: GreetingSettings;
  network?: NetworkSettings;
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
  },
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
  },
  network: {
    enableSupabase: false,
    enableStreamHandler: false
  }
};