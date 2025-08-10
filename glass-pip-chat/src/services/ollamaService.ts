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

export interface StreamingChunk {
  type: 'thinking' | 'content' | 'done';
  content: string;
  timestamp: number;
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
    onProgress?: (chunk: StreamingChunk) => void
  ): Promise<string> {
    const modelName = model || this.config.defaultModel;
    
    try {
      console.log(`Sending chat request to Ollama with model: ${modelName}`);
      console.log('Messages:', messages);
      
      // Use simple non-streaming approach for now
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data.message?.content || 'No response received';
      
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
      
      throw new Error(`Chat request failed: ${error.message}`);
    }
  }

  // Enhanced streaming chat with thinking indicators
  private async streamChat(
    messages: ChatMessage[],
    model: string,
    onProgress?: (chunk: StreamingChunk) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('Stream timeout'));
      }, this.config.streamTimeout);

      // Send thinking indicator
      onProgress?.({
        type: 'thinking',
        content: '🤔 Thinking...',
        timestamp: Date.now()
      });

      const requestData = {
        model: model,
        messages: messages,
        stream: true,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 2048,
        }
      };

      fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.body;
        })
        .then(body => {
          if (!body) {
            throw new Error('No response body');
          }

          const reader = body.getReader();
          const decoder = new TextDecoder();
          let fullResponse = '';
          let isFirstChunk = true;

          const readChunk = async () => {
            try {
              const { done, value } = await reader.read();
              
              if (done) {
                clearTimeout(timeoutId);
                onProgress?.({
                  type: 'done',
                  content: fullResponse,
                  timestamp: Date.now()
                });
                resolve(fullResponse);
                return;
              }

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n').filter(line => line.trim());

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  
                  if (data === '[DONE]') {
                    clearTimeout(timeoutId);
                    onProgress?.({
                      type: 'done',
                      content: fullResponse,
                      timestamp: Date.now()
                    });
                    resolve(fullResponse);
                    return;
                  }

                  try {
                    const parsed = JSON.parse(data);
                    
                    if (parsed.message?.content) {
                      const content = parsed.message.content;
                      fullResponse += content;
                      
                      // Clear thinking indicator on first content chunk
                      if (isFirstChunk) {
                        isFirstChunk = false;
                        onProgress?.({
                          type: 'content',
                          content: content,
                          timestamp: Date.now()
                        });
                      } else {
                        onProgress?.({
                          type: 'content',
                          content: content,
                          timestamp: Date.now()
                        });
                      }
                    }
                  } catch (parseError) {
                    console.warn('Failed to parse chunk:', data, parseError);
                  }
                }
              }

              // Continue reading
              readChunk();
            } catch (error) {
              clearTimeout(timeoutId);
              reject(error);
            }
          };

          readChunk();
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  // Generate text with streaming support
  async generate(
    prompt: string,
    model?: string,
    onProgress?: (chunk: StreamingChunk) => void
  ): Promise<string> {
    const modelName = model || this.config.defaultModel;
    
    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          prompt: prompt,
          stream: true,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 2048,
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                return fullResponse;
              }

              try {
                const parsed = JSON.parse(data);
                if (parsed.response) {
                  fullResponse += parsed.response;
                  onProgress?.({
                    type: 'content',
                    content: parsed.response,
                    timestamp: Date.now()
                  });
                }
              } catch (parseError) {
                console.warn('Failed to parse chunk:', data, parseError);
              }
            }
          }
        }
      }

      return fullResponse;
    } catch (error: any) {
      console.error('Generate request failed:', error);
      throw new Error(`Generate request failed: ${error.message}`);
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
