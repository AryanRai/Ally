/**
 * Vercel AI SDK Provider Adapters
 *
 * Providers are created on-demand so API keys are always read from the
 * current runtime config rather than captured at module load time.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export type ProviderMode = 'ollama' | 'openrouter' | 'gemini';
export type AgentMode = 'chat' | 'agent';

export interface ProviderKeys {
  openRouterApiKey?: string;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
}

/**
 * Return the appropriate language model for the given provider / mode.
 * Keys are passed in at call time so they always reflect the live config.
 */
export function getModel(
  provider: ProviderMode,
  modelId: string,
  mode: AgentMode,
  keys: ProviderKeys = {}
) {
  const ollamaBase = keys.ollamaBaseUrl ?? 'http://localhost:11434';

  const ollamaProvider = createOpenAI({
    baseURL: `${ollamaBase}/v1`,
    apiKey: 'ollama',
  });

  const openrouterProvider = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: keys.openRouterApiKey ?? '',
    headers: {
      'HTTP-Referer': 'https://glass-pip-chat.local',
      'X-Title': 'Glass PiP Chat',
    },
  });

  const geminiProvider = createGoogleGenerativeAI({
    apiKey: keys.geminiApiKey ?? '',
  });

  if (mode === 'agent') {
    return openrouterProvider.chat('anthropic/claude-sonnet-4-5');
  }

  switch (provider) {
    case 'ollama':
      return ollamaProvider.chat(modelId);
    case 'openrouter':
      return openrouterProvider.chat(modelId);
    case 'gemini':
      return geminiProvider(modelId);
  }
}
