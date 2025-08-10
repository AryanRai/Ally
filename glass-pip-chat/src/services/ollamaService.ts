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
  streamTimeout: number;
}

export class OllamaService {
  private config: OllamaServiceConfig;

  constructor(config: Partial<OllamaServiceConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:11434',
      defaultModel: config.defaultModel || 'llama3.2',
      timeout: config.timeout || 60000, // Increased to 60 seconds
      streamTimeout: config.streamTimeout || 120000, // 2 minutes for streaming
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
      
      // Always use streaming for better UX
      return this.streamChat(messages, modelName, onProgress);
      
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
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          throw new Error(`Request timeout after ${this.config.streamTimeout / 1000}s. Try increasing timeout in settings or using a smaller model.`);
        }
      }
      throw new Error(`Failed to get response from Ollama: ${error.message}`);
    }
  }

  // Stream chat response for real-time typing effect
  private async streamChat(
    messages: ChatMessage[],
    model: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    try {
      console.log('Starting streaming request...');
      
      // Create abort controller for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.streamTimeout);

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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Model "${model}" not found. Please check if the model is installed using: ollama list`);
        }
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      let fullResponse = '';
      let thinkingMode = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('Stream completed');
            break;
          }

          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const data: ChatResponse = JSON.parse(line);
              
              if (data.message?.content) {
                const content = data.message.content;
                
                // Check for thinking patterns
                if (content.includes('<thinking>') || content.includes('thinking:') || content.includes('Let me think')) {
                  thinkingMode = true;
                  onProgress?.(`💭 *${content}*`);
                } else if (thinkingMode && (content.includes('</thinking>') || content.includes('Now,') || content.includes('So,'))) {
                  thinkingMode = false;
                  onProgress?.(content);
                } else {
                  // Regular content - display immediately
                  onProgress?.(content);
                }
                
                fullResponse += content;
              }
              
              // Handle done status
              if (data.done) {
                console.log('Stream marked as done');
                break;
              }
            } catch (parseError) {
              // Ignore parsing errors for incomplete chunks
              console.warn('Failed to parse streaming chunk:', parseError, 'Line:', line);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      console.log('Final response length:', fullResponse.length);
      return fullResponse;
      
    } catch (error: any) {
      console.error('Streaming chat failed:', error);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.streamTimeout / 1000}s. Try using a smaller model or increase timeout in settings.`);
      }
      
      if (error.message.includes('fetch')) {
        throw new Error('Cannot connect to Ollama. Make sure Ollama is running on http://localhost:11434');
      }
      
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
