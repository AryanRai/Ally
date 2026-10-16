import { AppSettings } from '../types/settings';

export class GreetingUtils {
  static getCurrentGreeting(settings: AppSettings): string {
    const greetingSettings = settings.greeting;
    
    if (!greetingSettings) {
      return 'Balalalala';
    }

    if (greetingSettings.useRandomGreeting && greetingSettings.randomGreetings.length > 0) {
      const randomIndex = Math.floor(Math.random() * greetingSettings.randomGreetings.length);
      return greetingSettings.randomGreetings[randomIndex];
    }

    return greetingSettings.customGreeting || 'Balalalala';
  }
}