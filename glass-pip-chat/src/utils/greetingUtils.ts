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

  static async generateRandomGreeting(ollamaService: any): Promise<string> {
    if (!ollamaService) {
      return 'Balalalala';
    }

    try {
      const prompt = "Generate a short, fun, and friendly chat input placeholder text (2-4 words max). Be creative and playful. Examples: 'Balalalala', 'Beep boop!', 'Ready to chat!'. Just return the text, nothing else.";
      
      const response = await ollamaService.chat([
        { role: 'user', content: prompt }
      ], 'llama3.2:3b');

      // Clean up the response - remove quotes and extra text
      const cleaned = response.trim().replace(/^["']|["']$/g, '').split('\n')[0].trim();
      
      // Fallback if response is too long or empty
      if (!cleaned || cleaned.length > 20) {
        return 'Balalalala';
      }

      return cleaned;
    } catch (error) {
      console.error('Failed to generate random greeting:', error);
      return 'Balalalala';
    }
  }
}