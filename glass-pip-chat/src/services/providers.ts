/**
 * Vercel AI SDK Provider Adapters
 *
 * Centralises LLM provider configuration for all three supported providers:
 * Ollama (via OpenAI-compatible endpoint), OpenRouter, and Gemini.
 *
 * Critical: any agentic / tool-calling path is forced to use a capable cloud
 * model regardless of the user's UI provider selection.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Ollama exposes an OpenAI-compatible REST API at <base>/v1
export const ollamaProvider = createOpenAI({
  baseURL: `${import.meta.env.VITE_OLLAMA_BASE_URL ?? 'http://localhost:11434'}/v1`,
  apiKey: 'ollama', // Ollama does not require a real key
  name: 'ollama',
});

export const openrouterProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
  name: 'openrouter',
  defaultHeaders: {
    'HTTP-Referer': 'https://glass-pip-chat.local',
    'X-Title': 'Glass PiP Chat',
  },
});

export const geminiProvider = createGoogleGenerativeAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY ?? '',
});

export type ProviderMode = 'ollama' | 'openrouter' | 'gemini';
export type AgentMode = 'chat' | 'agent';

/**
 * Return the appropriate language model for the given provider / mode.
 *
 * CRITICAL ROUTING POLICY:
 *  - agent mode: always returns Claude Sonnet via OpenRouter — local models
 *    are not reliable for tool calling.
 *  - chat mode: respects the user's provider selection.
 */
export function getModel(provider: ProviderMode, modelId: string, mode: AgentMode) {
  if (mode === 'agent') {
    // Force a capable cloud model for all agentic / MCP paths
    return openrouterProvider('anthropic/claude-sonnet-4-5');
  }
  switch (provider) {
    case 'ollama':
      return ollamaProvider(modelId);
    case 'openrouter':
      return openrouterProvider(modelId);
    case 'gemini':
      return geminiProvider(modelId);
  }
}
