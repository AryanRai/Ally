import axios from 'axios';
import { GoogleGenAI } from '@google/genai';

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
  };
  top_provider: {
    max_completion_tokens?: number;
  };
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

export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ServiceConfig {
  // Ollama settings
  ollamaBaseUrl: string;
  ollamaDefaultModel: string;
  ollamaTimeout: number;
  ollamaStreamTimeout: number;
  
  // OpenRouter settings
  openRouterApiKey: string;
  openRouterBaseUrl: string;
  openRouterDefaultModel: string;
  openRouterTimeout: number;
  
  // Gemini settings
  geminiApiKey: string;
  geminiBaseUrl: string;
  geminiDefaultModel: string;
  geminiTimeout: number;
  
  // General settings
  preferredProvider: 'ollama' | 'openrouter' | 'gemini';
}

// Enhanced streaming with real-time thinking process
export interface ThinkingChunk {
  type: 'thinking' | 'response' | 'done';
  content: string;
  isComplete: boolean;
}

export class OllamaService {
  private config: ServiceConfig;

  constructor(config: Partial<ServiceConfig> = {}) {
    this.config = {
      // Ollama defaults
      ollamaBaseUrl: config.ollamaBaseUrl || 'http://localhost:11434',
      ollamaDefaultModel: config.ollamaDefaultModel || 'llama3.2',
      ollamaTimeout: config.ollamaTimeout || 60000,
      ollamaStreamTimeout: config.ollamaStreamTimeout || 120000,
      
      // OpenRouter defaults
      openRouterApiKey: config.openRouterApiKey || '',
      openRouterBaseUrl: config.openRouterBaseUrl || 'https://openrouter.ai/api/v1',
      openRouterDefaultModel: config.openRouterDefaultModel || 'anthropic/claude-3.5-sonnet',
      openRouterTimeout: config.openRouterTimeout || 60000,
      
      // Gemini defaults
      geminiApiKey: config.geminiApiKey || '',
      geminiBaseUrl: config.geminiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta',
      geminiDefaultModel: config.geminiDefaultModel || 'gemini-2.0-flash',
      geminiTimeout: config.geminiTimeout || 60000,
      
      // General defaults
      preferredProvider: config.preferredProvider || 'ollama',
    };
  }

  // Test if services are available
  async isAvailable(): Promise<boolean> {
    if (this.config.preferredProvider === 'openrouter') {
      return this.isOpenRouterAvailable();
    }
    if (this.config.preferredProvider === 'gemini') {
      return this.isGeminiAvailable();
    }
    return this.isOllamaAvailable();
  }

  // Test if Ollama is running and accessible
  async isOllamaAvailable(): Promise<boolean> {
    try {
      console.log(`Checking Ollama at: ${this.config.ollamaBaseUrl}/api/tags`);
      const response = await axios.get(`${this.config.ollamaBaseUrl}/api/tags`, {
        timeout: 5000,
      });
      console.log('Ollama response status:', response.status);
      return response.status === 200;
    } catch (error: any) {
      console.error('Ollama not available:', {
        message: error.message,
        code: error.code,
        url: `${this.config.ollamaBaseUrl}/api/tags`
      });
      return false;
    }
  }

  // Test if OpenRouter is accessible
  async isOpenRouterAvailable(): Promise<boolean> {
    try {
      if (!this.config.openRouterApiKey) {
        console.error('OpenRouter API key not configured');
        return false;
      }

      if (!this.config.openRouterApiKey.startsWith('sk-or-')) {
        console.error('Invalid OpenRouter API key format');
        return false;
      }
      
      console.log('Checking OpenRouter availability...');
      const response = await axios.get(`${this.config.openRouterBaseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.openRouterApiKey}`,
          'HTTP-Referer': 'https://glass-pip-chat.local',
          'X-Title': 'Glass PiP Chat'
        },
        timeout: 5000,
      });
      console.log('OpenRouter response status:', response.status);
      return response.status === 200;
    } catch (error: any) {
      console.error('OpenRouter not available:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
  }

  // Test OpenRouter with a simple non-streaming request using axios
  async testOpenRouterConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config.openRouterApiKey) {
        return { success: false, error: 'API key not configured' };
      }

      const testMessages = [{ role: 'user' as const, content: 'Hello' }];
      
      const response = await axios.post(`${this.config.openRouterBaseUrl}/chat/completions`, {
        model: 'anthropic/claude-3-haiku',
        messages: testMessages,
        stream: false,
        max_tokens: 10
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openRouterApiKey}`,
          'HTTP-Referer': 'https://glass-pip-chat.local',
          'X-Title': 'Glass PiP Chat'
        },
        timeout: 10000
      });

      return { success: true };
    } catch (error: any) {
      let errorMessage = error.message;
      if (error.response) {
        errorMessage = `HTTP ${error.response.status}: ${error.response.data?.error?.message || error.response.statusText}`;
      }
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  }

  // Get list of available models from both providers
  async getModels(): Promise<(OllamaModel | OpenRouterModel)[]> {
    const models: (OllamaModel | OpenRouterModel)[] = [];
    
    // Get Ollama models if available
    try {
      if (await this.isOllamaAvailable()) {
        const ollamaModels = await this.getOllamaModels();
        models.push(...ollamaModels);
      }
    } catch (error) {
      console.warn('Failed to get Ollama models:', error);
    }
    
    // Get OpenRouter models if configured
    try {
      if (this.config.openRouterApiKey && await this.isOpenRouterAvailable()) {
        const openRouterModels = await this.getOpenRouterModels();
        models.push(...openRouterModels);
      }
    } catch (error) {
      console.warn('Failed to get OpenRouter models:', error);
    }
    
    return models;
  }

  // Test if Gemini is accessible using the SDK
  async isGeminiAvailable(): Promise<boolean> {
    try {
      if (!this.config.geminiApiKey) {
        console.error('Gemini API key not configured');
        return false;
      }
      
      console.log('Checking Gemini availability with SDK...');
      // Just verify the API key is set - actual validation happens on first request
      return this.config.geminiApiKey.length > 0;
    } catch (error: any) {
      console.error('Gemini not available:', error.message);
      return false;
    }
  }

  // Test Gemini connection using the SDK - uses models.get to avoid rate limits
  async testGeminiConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config.geminiApiKey) {
        return { success: false, error: 'API key not configured' };
      }

      // Use a simple REST call to list models - this doesn't consume tokens
      // and is the lightest way to verify the API key works
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.geminiApiKey}`,
        { method: 'GET' }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          console.log('Gemini connection test successful, found', data.models.length, 'models');
          return { success: true };
        }
        return { success: false, error: 'No models found' };
      }

      // Handle specific error codes
      if (response.status === 400) {
        return { success: false, error: 'Invalid API key format' };
      }
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'Invalid or expired API key' };
      }
      if (response.status === 429) {
        return { success: false, error: 'Rate limited - please wait and try again' };
      }

      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    } catch (error: any) {
      console.error('Gemini connection test failed:', error);
      return { success: false, error: error.message || 'Connection failed' };
    }
  }

  // Get Gemini models - returns static list of recommended models
  async getGeminiModels(): Promise<any[]> {
    // Return static list of known models based on codegen_instructions.md
    return [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast and efficient (recommended)' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Low latency, high volume' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Latest flash model with thinking' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Advanced reasoning capabilities' },
    ];
  }

  // Chat with Gemini using the SDK
  private async chatGemini(
    messages: ChatMessage[],
    model: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    try {
      if (!this.config.geminiApiKey) {
        throw new Error('Gemini API key not configured');
      }

      const ai = new GoogleGenAI({ apiKey: this.config.geminiApiKey });

      // Extract system instruction
      const systemMsg = messages.find(m => m.role === 'system');
      
      // Build contents array for multi-turn conversation
      const nonSystemMessages = messages.filter(m => m.role !== 'system');
      
      // For simple single message, use direct content
      if (nonSystemMessages.length === 1) {
        console.log(`🚀 Sending Gemini request (simple) - Model: ${model}`);
        
        const response = await ai.models.generateContent({
          model,
          contents: nonSystemMessages[0].content,
          config: {
            ...(systemMsg && { systemInstruction: systemMsg.content }),
            temperature: 0.7,
          }
        });

        const content = response.text || '';
        
        if (onProgress && content) {
          onProgress(content);
        }

        return content;
      }

      // For multi-turn, build proper contents array
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      for (const msg of nonSystemMessages) {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const lastContent = contents[contents.length - 1];
        
        if (lastContent && lastContent.role === role) {
          lastContent.parts[0].text += '\n\n' + msg.content;
        } else {
          contents.push({ role, parts: [{ text: msg.content }] });
        }
      }

      // Ensure first message is from user
      if (contents.length > 0 && contents[0].role === 'model') {
        contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
      }

      console.log(`🚀 Sending Gemini request (multi-turn) - Model: ${model}, Messages: ${contents.length}`);

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          ...(systemMsg && { systemInstruction: systemMsg.content }),
          temperature: 0.7,
        }
      });

      const content = response.text || '';
      
      if (onProgress && content) {
        onProgress(content);
      }

      return content;
    } catch (error: any) {
      console.error('Gemini request failed:', error);
      
      let errorMessage = `Gemini API Error: ${error.message}`;
      
      if (error.message?.includes('404')) {
        errorMessage += `\n\n🔍 Model Not Found:\n• Model "${model}" may not exist\n• Try: gemini-2.0-flash or gemini-1.5-flash`;
      } else if (error.message?.includes('401') || error.message?.includes('403')) {
        errorMessage += '\n\n🔑 Authentication Error:\n• Your API key is invalid\n• Get a new key from https://aistudio.google.com/apikey';
      } else if (error.message?.includes('429')) {
        errorMessage += '\n\n⏱️ Rate Limited:\n• Too many requests\n• Wait a moment and try again';
      }
      
      throw new Error(errorMessage);
    }
  }

  // Stream chat with Gemini using the SDK
  async streamChatGemini(
    messages: ChatMessage[],
    model: string,
    onProgress: (chunk: ThinkingChunk) => void
  ): Promise<string> {
    try {
      if (!this.config.geminiApiKey) {
        throw new Error('Gemini API key not configured');
      }

      const ai = new GoogleGenAI({ apiKey: this.config.geminiApiKey });

      // Extract system instruction
      const systemMsg = messages.find(m => m.role === 'system');
      
      // Build contents
      const nonSystemMessages = messages.filter(m => m.role !== 'system');
      
      // For simple single message
      let contents: string | Array<{ role: string; parts: Array<{ text: string }> }>;
      
      if (nonSystemMessages.length === 1) {
        contents = nonSystemMessages[0].content;
      } else {
        // Build multi-turn contents
        const contentArray: Array<{ role: string; parts: Array<{ text: string }> }> = [];
        for (const msg of nonSystemMessages) {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          const lastContent = contentArray[contentArray.length - 1];
          
          if (lastContent && lastContent.role === role) {
            lastContent.parts[0].text += '\n\n' + msg.content;
          } else {
            contentArray.push({ role, parts: [{ text: msg.content }] });
          }
        }

        // Ensure first message is from user
        if (contentArray.length > 0 && contentArray[0].role === 'model') {
          contentArray.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
        }
        
        contents = contentArray;
      }

      console.log(`🚀 Streaming Gemini request - Model: ${model}`);

      const responseStream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          ...(systemMsg && { systemInstruction: systemMsg.content }),
          temperature: 0.7,
        }
      });

      let fullResponse = '';

      for await (const chunk of responseStream) {
        const text = chunk.text || '';
        if (text) {
          fullResponse += text;
          onProgress({
            type: 'response',
            content: fullResponse,
            isComplete: false
          });
        }
      }

      onProgress({
        type: 'done',
        content: fullResponse,
        isComplete: true
      });

      return fullResponse;
    } catch (error: any) {
      console.error('Gemini streaming failed:', error);
      throw new Error(`Gemini streaming error: ${error.message}`);
    }
  }

  // Get Ollama models specifically
  async getOllamaModels(): Promise<OllamaModel[]> {
    try {
      const response = await axios.get(`${this.config.ollamaBaseUrl}/api/tags`, {
        timeout: 10000,
      });
      return response.data.models || [];
    } catch (error) {
      console.error('Failed to get Ollama models:', error);
      throw new Error('Failed to fetch Ollama models');
    }
  }

  // Get OpenRouter models specifically
  async getOpenRouterModels(): Promise<OpenRouterModel[]> {
    try {
      if (!this.config.openRouterApiKey) {
        throw new Error('OpenRouter API key not configured');
      }

      const response = await axios.get(`${this.config.openRouterBaseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.openRouterApiKey}`,
          'HTTP-Referer': 'https://glass-pip-chat.local',
          'X-Title': 'Glass PiP Chat'
        },
        timeout: 10000,
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error('Failed to get OpenRouter models:', error);
      throw new Error('Failed to fetch OpenRouter models');
    }
  }

  // Send a chat message and get response
  async chat(
    messages: ChatMessage[],
    model?: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    let modelName = model || this.getDefaultModel();
    
    // Map display names to actual model IDs
    const originalModel = modelName;
    modelName = this.mapDisplayNameToModelId(modelName);
    
    // Debug logging
    console.log('🤖 Chat Request Debug:', {
      providedModel: model,
      originalModel,
      mappedModel: modelName,
      preferredProvider: this.config.preferredProvider,
      hasOpenRouterKey: !!this.config.openRouterApiKey,
      hasGeminiKey: !!this.config.geminiApiKey,
      openRouterDefaultModel: this.config.openRouterDefaultModel,
      geminiDefaultModel: this.config.geminiDefaultModel,
      ollamaDefaultModel: this.config.ollamaDefaultModel
    });
    
    // Determine provider based on model name or configuration
    const isOpenRouterModel = this.isOpenRouterModelName(modelName);
    const isGeminiModel = this.isGeminiModelName(modelName);
    const useOpenRouter = isOpenRouterModel || (this.config.preferredProvider === 'openrouter' && this.config.openRouterApiKey);
    const useGemini = isGeminiModel || (this.config.preferredProvider === 'gemini' && this.config.geminiApiKey);
    
    console.log('🔀 Provider Selection:', {
      modelName,
      isOpenRouterModel,
      isGeminiModel,
      preferredProvider: this.config.preferredProvider,
      hasOpenRouterKey: !!this.config.openRouterApiKey,
      hasGeminiKey: !!this.config.geminiApiKey,
      useOpenRouter,
      useGemini
    });
    
    if (useGemini) {
      return this.chatGemini(messages, modelName, onProgress);
    } else if (useOpenRouter) {
      return this.chatOpenRouter(messages, modelName, onProgress);
    } else {
      return this.chatOllama(messages, modelName, onProgress);
    }
  }

  // Chat with Ollama
  private async chatOllama(
    messages: ChatMessage[],
    model: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    try {
      console.log(`Sending chat request to Ollama with model: ${model}`);
      console.log('Messages:', messages);
      
      // Always use streaming for better UX
      return this.streamChatOllama(messages, model, onProgress);
      
    } catch (error: any) {
      console.error('Ollama chat request failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        code: error.code,
        url: `${this.config.ollamaBaseUrl}/api/chat`,
        model
      });
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error(`Model "${model}" not found. Please check if the model is installed using: ollama list`);
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
          throw new Error(`Request timeout after ${this.config.ollamaStreamTimeout / 1000}s. Try increasing timeout in settings or using a smaller model.`);
        }
      }
      throw new Error(`Failed to get response from Ollama: ${error.message}`);
    }
  }

  // Chat with OpenRouter using axios (more reliable in Electron)
  private async chatOpenRouter(
    messages: ChatMessage[],
    model: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    try {
      if (!this.config.openRouterApiKey) {
        throw new Error('OpenRouter API key not configured');
      }

      if (!this.config.openRouterApiKey.startsWith('sk-or-')) {
        throw new Error('Invalid OpenRouter API key format. Key should start with "sk-or-"');
      }

      // Validate model name for OpenRouter
      if (!model.includes('/')) {
        console.error(`Invalid OpenRouter model format: "${model}"`);
        throw new Error(`❌ Invalid OpenRouter model format: "${model}"\n\n✅ OpenRouter models should be in format "provider/model-name"\n\nExamples:\n• anthropic/claude-3.5-sonnet\n• openai/gpt-4o\n• google/gemini-pro-1.5\n\nPlease select a valid model from the dropdown in Provider Settings.`);
      }

      console.log(`🚀 Sending OpenRouter request with axios - Model: ${model}`);

      // Use non-streaming request with axios (more reliable in Electron)
      const response = await axios.post(`${this.config.openRouterBaseUrl}/chat/completions`, {
        model,
        messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
        stream: false,
        temperature: 0.7,
        max_tokens: 4000
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openRouterApiKey}`,
          'HTTP-Referer': 'https://glass-pip-chat.local',
          'X-Title': 'Glass PiP Chat'
        },
        timeout: this.config.openRouterTimeout
      });

      const content = response.data.choices?.[0]?.message?.content || '';
      
      // Simulate streaming by sending the content in chunks
      if (onProgress && content) {
        const words = content.split(' ');
        let accumulatedContent = '';
        for (const word of words) {
          accumulatedContent += word + ' ';
          onProgress(accumulatedContent);
          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      return content;
    } catch (error: any) {
      console.error('OpenRouter axios request failed:', error);
      
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        
        let errorMessage = `OpenRouter API Error (${status}): ${errorData?.error?.message || error.response.statusText}`;
        
        if (status === 400) {
          errorMessage += '\n\n🔧 Troubleshooting:\n• Check if the model name is correct\n• Verify your API key is valid\n• Ensure you have sufficient credits';
        } else if (status === 401) {
          errorMessage += '\n\n🔑 Authentication Error:\n• Your API key is invalid or expired\n• Get a new key from https://openrouter.ai/keys';
        } else if (status === 402) {
          errorMessage += '\n\n💳 Payment Required:\n• Insufficient credits in your OpenRouter account\n• Add credits at https://openrouter.ai/credits';
        }
        
        throw new Error(errorMessage);
      }
      
      throw new Error(`Network error: ${error.message}\n\nTroubleshooting:\n• Check your internet connection\n• Verify OpenRouter API is accessible`);
    }
  }

  // Stream chat response for Ollama
  private async streamChatOllama(
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
      }, this.config.ollamaStreamTimeout);

      const response = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
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
                fullResponse += content;
                onProgress?.(fullResponse);
              }
              
              if (data.done) {
                console.log('Stream marked as done');
                break;
              }
            } catch (parseError) {
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
        throw new Error(`Request timeout after ${this.config.ollamaStreamTimeout / 1000}s. Try using a smaller model or increase timeout in settings.`);
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
    // Map display names to actual model IDs
    const mappedModel = this.mapDisplayNameToModelId(model);
    console.log('🎭 StreamChatWithThinking - Model mapping:', { original: model, mapped: mappedModel });
    
    // Determine provider based on model name or configuration
    const isOpenRouterModel = this.isOpenRouterModelName(mappedModel);
    const isGeminiModel = this.isGeminiModelName(mappedModel);
    const useOpenRouter = isOpenRouterModel || (this.config.preferredProvider === 'openrouter' && this.config.openRouterApiKey);
    const useGemini = isGeminiModel || (this.config.preferredProvider === 'gemini' && this.config.geminiApiKey);
    
    console.log('🔀 StreamChatWithThinking - Provider selection:', {
      mappedModel,
      isOpenRouterModel,
      isGeminiModel,
      preferredProvider: this.config.preferredProvider,
      hasOpenRouterKey: !!this.config.openRouterApiKey,
      hasGeminiKey: !!this.config.geminiApiKey,
      useOpenRouter,
      useGemini
    });
    
    if (useGemini) {
      // Use Gemini streaming
      return this.streamChatGemini(messages, mappedModel, onProgress);
    } else if (useOpenRouter) {
      // Use axios-based approach for OpenRouter with thinking simulation
      const response = await this.chatOpenRouter(messages, mappedModel, (cumulativeContent) => {
        // Convert regular progress to thinking chunks - content is already cumulative
        onProgress({
          type: 'response',
          content: cumulativeContent,
          isComplete: false
        });
      });
      
      // Send final completion
      onProgress({
        type: 'done',
        content: response,
        isComplete: true
      });
      
      return response;
    } else {
      return this.streamChatWithThinkingOllama(messages, mappedModel, onProgress, abortSignal);
    }
  }

  // Enhanced streaming with thinking for Ollama
  private async streamChatWithThinkingOllama(
    messages: ChatMessage[],
    model: string,
    onProgress: (chunk: ThinkingChunk) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    try {
      console.log('Starting enhanced Ollama streaming with thinking detection...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.ollamaStreamTimeout);

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          controller.abort();
        });
      }

      const response = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
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
                  /let me think/i, /i need to/i, /first,?\s/i, /considering/i, /analyzing/i,
                  /looking at/i, /examining/i, /hmm,?\s/i, /well,?\s/i, /actually,?\s/i,
                  /wait,?\s/i, /hold on/i, /thinking about/i, /let's see/i, /i should/i,
                  /i would/i, /i could/i, /perhaps/i, /maybe/i, /it seems/i, /it appears/i,
                  /based on/i, /given that/i, /since/i, /because/i, /due to/i, /as a result/i,
                  /therefore/i, /thus/i, /so/i, /hence/i, /consequently/i
                ];

                const responsePatterns = [
                  /^(here's|here is)/i, /^(the answer)/i, /^(to answer)/i, /^(in summary)/i,
                  /^(in conclusion)/i, /^(finally)/i, /^(ultimately)/i, /^(overall)/i,
                  /^(basically)/i, /^(simply put)/i, /^(in other words)/i, /^(that means)/i,
                  /^(this means)/i, /^(so the)/i, /^(therefore the)/i, /^(thus the)/i
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
                  
                  if (content.includes('.') || content.includes('!') || content.includes('?')) {
                    const sentences = buffer.split(/[.!?]+/);
                    if (sentences.length > 2) {
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
                
                // Add small delay for real-time effect
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

  // Generate a simple completion (non-chat) - Ollama only
  async generate(
    prompt: string,
    model?: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    const modelName = model || this.config.ollamaDefaultModel;
    
    try {
      const response = await axios.post(
        `${this.config.ollamaBaseUrl}/api/generate`,
        {
          model: modelName,
          prompt,
          stream: false,
        },
        {
          timeout: this.config.ollamaTimeout,
        }
      );

      return response.data.response;
    } catch (error) {
      console.error('Generate request failed:', error);
      throw new Error('Failed to generate response from Ollama');
    }
  }

  // Helper method to determine if a model name is from OpenRouter
  private isOpenRouterModelName(model: string): boolean {
    const openRouterPrefixes = [
      'openai/', 'anthropic/', 'google/', 'meta-llama/', 'mistralai/',
      'cohere/', 'perplexity/', 'microsoft/', 'nousresearch/', 'qwen/',
      'deepseek/', 'liquid/', 'ai21/', 'databricks/', 'nvidia/', 'x-ai/'
    ];
    
    // Also check for common display names that should map to OpenRouter
    const openRouterDisplayNames = [
      'xai:', 'grok', 'claude', 'gpt-4', 'llama-3'
    ];
    
    const modelLower = model.toLowerCase();
    
    // Don't match Gemini models as OpenRouter - they should go to direct Gemini API
    if (this.isGeminiModelName(model)) {
      return false;
    }
    
    // Check prefixes first
    if (openRouterPrefixes.some(prefix => model.startsWith(prefix))) {
      return true;
    }
    
    // Check display names
    if (openRouterDisplayNames.some(name => modelLower.includes(name))) {
      console.log(`🔍 Detected OpenRouter model by display name: ${model}`);
      return true;
    }
    
    return false;
  }

  // Helper method to determine if a model name is from Gemini
  private isGeminiModelName(model: string): boolean {
    const geminiPatterns = [
      'gemini-2.0', 'gemini-2.5', 'gemini-1.5', 'gemini-1.0', 'gemini-pro', 'gemini-flash',
      'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'
    ];
    
    const modelLower = model.toLowerCase();
    
    // Check if it's a direct Gemini model (not via OpenRouter)
    // OpenRouter Gemini models have 'google/' prefix
    if (model.startsWith('google/')) {
      return false; // This is OpenRouter's Gemini
    }
    
    // Check for Gemini patterns
    if (geminiPatterns.some(pattern => modelLower.includes(pattern))) {
      console.log(`🔍 Detected direct Gemini model: ${model}`);
      return true;
    }
    
    return false;
  }

  // Helper method to map display names to actual OpenRouter model IDs
  private mapDisplayNameToModelId(displayName: string): string {
    const modelMappings: Record<string, string> = {
      'xai: grok 4 fast (free)': 'x-ai/grok-beta',
      'xai: grok beta': 'x-ai/grok-beta',
      'grok': 'x-ai/grok-beta',
      'claude 3.5 sonnet': 'anthropic/claude-3.5-sonnet',
      'gpt-4o': 'openai/gpt-4o',
      'gpt-4o mini': 'openai/gpt-4o-mini',
      'gemini pro 1.5': 'google/gemini-pro-1.5'
    };
    
    const normalizedName = displayName.toLowerCase().trim();
    const mappedId = modelMappings[normalizedName];
    
    if (mappedId) {
      console.log(`🔄 Mapped display name "${displayName}" to model ID "${mappedId}"`);
      return mappedId;
    }
    
    return displayName;
  }

  // Helper method to get default model based on provider
  private getDefaultModel(): string {
    let defaultModel: string;
    
    if (this.config.preferredProvider === 'gemini' && this.config.geminiApiKey) {
      defaultModel = this.config.geminiDefaultModel;
    } else if (this.config.preferredProvider === 'openrouter' && this.config.openRouterApiKey) {
      defaultModel = this.config.openRouterDefaultModel;
    } else {
      defaultModel = this.config.ollamaDefaultModel;
    }
    
    console.log('🎯 Default Model Selection:', {
      preferredProvider: this.config.preferredProvider,
      hasOpenRouterKey: !!this.config.openRouterApiKey,
      hasGeminiKey: !!this.config.geminiApiKey,
      openRouterDefault: this.config.openRouterDefaultModel,
      geminiDefault: this.config.geminiDefaultModel,
      ollamaDefault: this.config.ollamaDefaultModel,
      selectedDefault: defaultModel
    });
    
    return defaultModel;
  }

  // Update configuration
  updateConfig(newConfig: Partial<ServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Get current configuration
  getConfig(): ServiceConfig {
    return { ...this.config };
  }

  // Set preferred provider
  setProvider(provider: 'ollama' | 'openrouter' | 'gemini'): void {
    this.config.preferredProvider = provider;
  }

  // Get available providers
  getAvailableProviders(): Array<{ name: string, available: boolean, configured: boolean }> {
    return [
      {
        name: 'ollama',
        available: true, // Will be checked async
        configured: true
      },
      {
        name: 'openrouter',
        available: !!this.config.openRouterApiKey,
        configured: !!this.config.openRouterApiKey
      },
      {
        name: 'gemini',
        available: !!this.config.geminiApiKey,
        configured: !!this.config.geminiApiKey
      }
    ];
  }

  // Public method for main process to use OpenRouter streaming
  async streamChatOpenRouter(
    messages: ChatMessage[],
    model: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    return this.chatOpenRouter(messages, model, onProgress);
  }

  // Public method for main process to use Gemini streaming
  async streamChatGeminiPublic(
    messages: ChatMessage[],
    model: string,
    onProgress: (chunk: ThinkingChunk) => void
  ): Promise<string> {
    return this.streamChatGemini(messages, model, onProgress);
  }
}

// Default instance
export const ollamaService = new OllamaService();