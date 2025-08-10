import axios from 'axios';

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  message: ChatMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaServiceConfig {
  baseUrl: string;
  defaultModel: string;
  timeout: number;
}

export class OllamaService {
  private config: OllamaServiceConfig;

  constructor(config: Partial<OllamaServiceConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:11434',
      defaultModel: config.defaultModel || 'llama3.2',
      timeout: config.timeout || 30000,
    };
  }

  // Test if Ollama is running and accessible
  async isAvailable(): Promise<boolean> {
    try {
      console.log(`Checking Ollama at: ${this.config.baseUrl}/api/tags`);
      const response = await axios.get(`${this.config.baseUrl}/api/tags`, {
        timeout: 5000,
      });
      console.log('Ollama response status:', response.status);
      return response.status === 200;
    } catch (error: any) {
      console.error('Ollama not available:', {
        message: error.message,
        code: error.code,
        url: `${this.config.baseUrl}/api/tags`
      });
      return false;
    }
  }

  // Get list of available models
  async getModels(): Promise<OllamaModel[]> {
    try {
      const response = await axios.get(`${this.config.baseUrl}/api/tags`, {
        timeout: 10000,
      });
      return response.data.models || [];
    } catch (error) {
      console.error('Failed to get models:', error);
      throw new Error('Failed to fetch available models');
    }
  }

  // Send a chat message and get response
  async chat(
    messages: ChatMessage[],
    model?: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    const modelName = model || this.config.defaultModel;
    
    try {
      console.log(`Sending chat request to Ollama with model: ${modelName}`);
      console.log('Messages:', messages);
      
      // Check if we want streaming
      if (onProgress) {
        return this.streamChat(messages, modelName, onProgress);
      }

      // Non-streaming response
      const requestBody = {
        model: modelName,
        messages,
        stream: false,
      };
      
      console.log('Request body:', requestBody);
      
      const response = await axios.post(
        `${this.config.baseUrl}/api/chat`,
        requestBody,
        {
          timeout: this.config.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Ollama response:', response.data);
      const chatResponse: ChatResponse = response.data;
      return chatResponse.message.content;
    } catch (error: any) {
      console.error('Chat request failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
        url: `${this.config.baseUrl}/api/chat`,
        model: modelName
      });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error(`Model "${modelName}" not found. Please check if the model is installed using: ollama list`);
        }
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Cannot connect to Ollama. Make sure Ollama is running on http://localhost:11434');
        }
        if (error.response?.status === 400) {
          throw new Error(`Bad request to Ollama: ${error.response.data?.error || 'Invalid request format'}`);
        }
        if (error.code === 'ENOTFOUND') {
          throw new Error('Ollama server not found. Check if Ollama is installed and running.');
        }
      }
      throw new Error(`Failed to get response from Ollama: ${error.message}`);
    }
  }

  // Stream chat response for real-time typing effect
  private async streamChat(
    messages: ChatMessage[],
    model: string,
    onProgress: (chunk: string) => void
  ): Promise<string> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data: ChatResponse = JSON.parse(line);
            if (data.message?.content) {
              fullResponse += data.message.content;
              onProgress(data.message.content);
            }
          } catch (parseError) {
            // Ignore parsing errors for incomplete chunks
            console.warn('Failed to parse streaming chunk:', parseError);
          }
        }
      }

      return fullResponse;
    } catch (error) {
      console.error('Streaming chat failed:', error);
      throw error;
    }
  }

  // Generate a simple completion (non-chat)
  async generate(
    prompt: string,
    model?: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    const modelName = model || this.config.defaultModel;
    
    try {
      const response = await axios.post(
        `${this.config.baseUrl}/api/generate`,
        {
          model: modelName,
          prompt,
          stream: false,
        },
        {
          timeout: this.config.timeout,
        }
      );

      return response.data.response;
    } catch (error) {
      console.error('Generate request failed:', error);
      throw new Error('Failed to generate response from Ollama');
    }
  }

  // Update configuration
  updateConfig(newConfig: Partial<OllamaServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Get current configuration
  getConfig(): OllamaServiceConfig {
    return { ...this.config };
  }
}

// Default instance
export const ollamaService = new OllamaService();
