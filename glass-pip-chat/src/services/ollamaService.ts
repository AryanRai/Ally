import axios from 'axios';
import { streamText, type ModelMessage } from 'ai';
import { getModel, type ProviderMode, type ProviderKeys } from './providers.js';

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

// ---------------------------------------------------------------------------
// Vercel AI SDK helpers
// ---------------------------------------------------------------------------

/**
 * Convert internal ChatMessage[] to CoreMessage[] for Vercel AI SDK.
 * System messages are removed from the array — pass them via the `system`
 * parameter in streamText() instead.
 */
function toAISDKMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages
    .filter((m) => m.role !== 'system')
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
      m.role === 'user' || m.role === 'assistant'
    )
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));
}

/** Extract the system prompt from a ChatMessage array. */
function extractSystemPrompt(messages: ChatMessage[]): string | undefined {
  return messages.find((m) => m.role === 'system')?.content;
}

// ---------------------------------------------------------------------------

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

  // Chat with Gemini — delegates to unified Vercel AI SDK streaming
  private async chatGemini(
    messages: ChatMessage[],
    model: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    if (!this.config.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }
    return this.streamChatWithAI(messages, model, 'gemini', onProgress);
  }

  // Stream chat with Gemini — delegates to unified Vercel AI SDK streaming
  async streamChatGemini(
    messages: ChatMessage[],
    model: string,
    onProgress: (chunk: ThinkingChunk) => void
  ): Promise<string> {
    if (!this.config.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }
    return this.streamChatWithThinkingViaAI(messages, model, 'gemini', onProgress);
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

  // Chat with Ollama — delegates to unified Vercel AI SDK streaming
  private async chatOllama(
    messages: ChatMessage[],
    model: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    console.log(`Sending chat request to Ollama with model: ${model}`);
    return this.streamChatWithAI(messages, model, 'ollama', onProgress);
  }

  // Chat with OpenRouter — delegates to unified Vercel AI SDK streaming
  private async chatOpenRouter(
    messages: ChatMessage[],
    model: string,
    onProgress?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    if (!this.config.openRouterApiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    if (!this.config.openRouterApiKey.startsWith('sk-or-')) {
      throw new Error('Invalid OpenRouter API key format. Key should start with "sk-or-"');
    }

    if (!model.includes('/')) {
      throw new Error(
        `❌ Invalid OpenRouter model format: "${model}"\n\n` +
        `✅ OpenRouter models should be in format "provider/model-name"\n\n` +
        `Examples:\n• anthropic/claude-3.5-sonnet\n• openai/gpt-4o\n• google/gemini-pro-1.5\n\n` +
        `Please select a valid model from the dropdown in Provider Settings.`
      );
    }

    console.log(`🚀 Sending OpenRouter request via Vercel AI SDK - Model: ${model}`);
    return this.streamChatWithAI(messages, model, 'openrouter', onProgress, abortSignal);
  }

  // ---------------------------------------------------------------------------
  // Unified Vercel AI SDK streaming — replaces all provider-specific fetch loops
  // ---------------------------------------------------------------------------

  /**
   * Stream a chat response via Vercel AI SDK's streamText.
   * Handles all three providers (Ollama, OpenRouter, Gemini) with a single implementation.
   */
  private async streamChatWithAI(
    messages: ChatMessage[],
    model: string,
    providerMode: ProviderMode,
    onProgress?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const systemPrompt = extractSystemPrompt(messages);
    const coreMessages = toAISDKMessages(messages);
    const keys: ProviderKeys = {
      openRouterApiKey: this.config.openRouterApiKey,
      geminiApiKey: this.config.geminiApiKey,
      ollamaBaseUrl: this.config.ollamaBaseUrl,
    };

    try {
      const result = streamText({
        model: getModel(providerMode, model, 'chat', keys),
        system: systemPrompt,
        messages: coreMessages,
        abortSignal,
      });

      let fullResponse = '';
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        onProgress?.(fullResponse);
      }
      return fullResponse;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw Object.assign(new Error('Request aborted by user'), { name: 'AbortError' });
      }
      throw error;
    }
  }

  /**
   * Stream a chat response with thinking/response phase detection,
   * using Vercel AI SDK's streamText for all providers.
   *
   * Handles <think>…</think> blocks emitted by some models (e.g. QwQ, DeepSeek)
   * and maps them to ThinkingChunk events.
   */
  private async streamChatWithThinkingViaAI(
    messages: ChatMessage[],
    model: string,
    providerMode: ProviderMode,
    onProgress: (chunk: ThinkingChunk) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const systemPrompt = extractSystemPrompt(messages);
    const coreMessages = toAISDKMessages(messages);
    const keys: ProviderKeys = {
      openRouterApiKey: this.config.openRouterApiKey,
      geminiApiKey: this.config.geminiApiKey,
      ollamaBaseUrl: this.config.ollamaBaseUrl,
    };

    try {
      const result = streamText({
        model: getModel(providerMode, model, 'chat', keys),
        system: systemPrompt,
        messages: coreMessages,
        abortSignal,
      });

      let fullResponse = '';
      let inThinkBlock = false;

      for await (const chunk of result.textStream) {
        fullResponse += chunk;

        // Detect open/close <think> tags in the accumulated buffer
        if (!inThinkBlock && fullResponse.includes('<think>')) {
          inThinkBlock = true;
        }
        if (inThinkBlock && fullResponse.includes('</think>')) {
          inThinkBlock = false;
        }

        // Extract parts
        const thinkMatch = fullResponse.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
          const afterThink = fullResponse.replace(thinkMatch[0], '').trim();
          onProgress({ type: 'thinking', content: thinkMatch[1], isComplete: !inThinkBlock });
          if (afterThink) {
            onProgress({ type: 'response', content: afterThink, isComplete: false });
          }
        } else if (inThinkBlock) {
          const thinkContent = fullResponse.replace('<think>', '');
          onProgress({ type: 'thinking', content: thinkContent, isComplete: false });
        } else {
          onProgress({ type: 'response', content: fullResponse, isComplete: false });
        }
      }

      onProgress({ type: 'done', content: fullResponse, isComplete: true });
      return fullResponse;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        onProgress({ type: 'done', content: 'Stopped by user', isComplete: false });
        return 'Stopped by user';
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
      return this.streamChatWithThinkingViaAI(messages, mappedModel, 'gemini', onProgress, abortSignal);
    } else if (useOpenRouter) {
      return this.streamChatWithThinkingViaAI(messages, mappedModel, 'openrouter', onProgress, abortSignal);
    } else {
      return this.streamChatWithThinkingViaAI(messages, mappedModel, 'ollama', onProgress, abortSignal);
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