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

// Enhanced streaming with real-time thinking process
export interface ThinkingChunk {
  type: 'thinking' | 'response' | 'done';
  content: string;
  isComplete: boolean;
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
                }
                
                if (thinkingMode && (content.includes('</thinking>') || content.includes('Now,') || content.includes('So,'))) {
                  thinkingMode = false;
                }
                
                // Always display the actual content
                onProgress?.(content);
                
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

  // Enhanced streaming with real-time thinking and word-by-word display
  async streamChatWithThinking(
    messages: ChatMessage[],
    model: string,
    onProgress: (chunk: ThinkingChunk) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    try {
      console.log('Starting enhanced streaming with thinking detection...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.streamTimeout);

      // If external abort signal is provided, listen to it
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          controller.abort();
        });
      }

      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          // Add options to encourage thinking output
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: -1
          }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      let fullResponse = '';
      let thinkingContent = '';
      let responseContent = '';
      let isInThinking = false;
      let responseStarted = false;
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('Stream completed');
            onProgress({ type: 'done', content: fullResponse, isComplete: true });
            break;
          }

          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const data: ChatResponse = JSON.parse(line);
              
              if (data.message?.content) {
                const content = data.message.content;
                buffer += content;
                
                // Enhanced thinking detection patterns
                const thinkingPatterns = [
                  /let me think/i,
                  /i need to/i,
                  /first,?\s/i,
                  /considering/i,
                  /analyzing/i,
                  /looking at/i,
                  /examining/i,
                  /hmm,?\s/i,
                  /well,?\s/i,
                  /actually,?\s/i,
                  /wait,?\s/i,
                  /hold on/i,
                  /thinking about/i,
                  /let's see/i,
                  /i should/i,
                  /i would/i,
                  /i could/i,
                  /perhaps/i,
                  /maybe/i,
                  /it seems/i,
                  /it appears/i,
                  /based on/i,
                  /given that/i,
                  /since/i,
                  /because/i,
                  /due to/i,
                  /as a result/i,
                  /therefore/i,
                  /thus/i,
                  /so/i,
                  /hence/i,
                  /consequently/i
                ];

                const responsePatterns = [
                  /^(here's|here is)/i,
                  /^(the answer)/i,
                  /^(to answer)/i,
                  /^(in summary)/i,
                  /^(in conclusion)/i,
                  /^(finally)/i,
                  /^(ultimately)/i,
                  /^(overall)/i,
                  /^(basically)/i,
                  /^(simply put)/i,
                  /^(in other words)/i,
                  /^(that means)/i,
                  /^(this means)/i,
                  /^(so the)/i,
                  /^(therefore the)/i,
                  /^(thus the)/i
                ];

                // Detect thinking phase
                if (!responseStarted && !isInThinking) {
                  for (const pattern of thinkingPatterns) {
                    if (pattern.test(buffer)) {
                      isInThinking = true;
                      console.log('Detected thinking phase with pattern:', pattern);
                      break;
                    }
                  }
                }

                // Detect response phase
                if (isInThinking && !responseStarted) {
                  for (const pattern of responsePatterns) {
                    if (pattern.test(content)) {
                      isInThinking = false;
                      responseStarted = true;
                      console.log('Detected response phase with pattern:', pattern);
                      break;
                    }
                  }
                  
                  // Also check for sentence completion that might indicate end of thinking
                  if (content.includes('.') || content.includes('!') || content.includes('?')) {
                    const sentences = buffer.split(/[.!?]+/);
                    if (sentences.length > 2) { // Multiple sentences likely means thinking is done
                      isInThinking = false;
                      responseStarted = true;
                      console.log('Detected response phase after multiple sentences');
                    }
                  }
                }

                // Auto-transition to response after reasonable thinking length
                if (isInThinking && thinkingContent.length > 300 && !responseStarted) {
                  isInThinking = false;
                  responseStarted = true;
                  console.log('Auto-transitioning to response phase after long thinking');
                }

                // Send real-time updates
                if (isInThinking) {
                  thinkingContent += content;
                  onProgress({ 
                    type: 'thinking', 
                    content: thinkingContent, 
                    isComplete: false 
                  });
                } else {
                  responseContent += content;
                  onProgress({ 
                    type: 'response', 
                    content: responseContent, 
                    isComplete: false 
                  });
                }

                fullResponse += content;
                
                // Add small delay for real-time effect (reduced for better responsiveness)
                await new Promise(resolve => setTimeout(resolve, 5));
              }
              
              if (data.done) {
                onProgress({ type: 'done', content: fullResponse, isComplete: true });
                break;
              }
            } catch (parseError) {
              console.warn('Failed to parse streaming chunk:', parseError);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return fullResponse;
      
    } catch (error: any) {
      console.error('Enhanced streaming failed:', error);
      
      if (error.name === 'AbortError') {
        console.log('Streaming was aborted by user');
        onProgress({ type: 'done', content: 'Stopped by user', isComplete: false });
        return 'Stopped by user';
      }
      
      throw error;
    }
  }

  // Method to get thinking tokens specifically
  async getThinkingResponse(
    messages: ChatMessage[],
    model: string,
    onProgress: (thinking: string, response: string) => void
  ): Promise<{ thinking: string, response: string }> {
    try {
      let thinking = '';
      let response = '';
      let phase: 'thinking' | 'response' = 'thinking';

      await this.streamChatWithThinking(messages, model, (chunk) => {
        if (chunk.type === 'thinking') {
          thinking += chunk.content;
          phase = 'thinking';
        } else if (chunk.type === 'response') {
          if (phase === 'thinking') {
            phase = 'response';
          }
          response += chunk.content;
        }
        
        onProgress(thinking, response);
      });

      return { thinking, response };
    } catch (error) {
      console.error('Failed to get thinking response:', error);
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
