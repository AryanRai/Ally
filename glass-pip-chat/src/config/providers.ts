// Provider configuration management
export interface ProviderConfig {
  ollama: {
    baseUrl: string;
    defaultModel: string;
    timeout: number;
    streamTimeout: number;
  };
  openrouter: {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    timeout: number;
  };
  gemini: {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    timeout: number;
  };
  preferred: 'ollama' | 'openrouter' | 'gemini';
}

export const defaultProviderConfig: ProviderConfig = {
  ollama: {
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2',
    timeout: 60000,
    streamTimeout: 120000,
  },
  openrouter: {
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    timeout: 60000,
  },
  gemini: {
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    timeout: 60000,
  },
  preferred: 'ollama',
};

// Popular Google Gemini models
export const popularGeminiModels = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Fast and efficient for most tasks (recommended)',
    provider: 'Google'
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    description: 'Low latency, high volume tasks',
    provider: 'Google'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Latest flash model with thinking capabilities',
    provider: 'Google'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Advanced reasoning and complex tasks',
    provider: 'Google'
  }
];

// Popular OpenRouter models with descriptions
export const popularOpenRouterModels = [
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Most capable Claude model, excellent for complex reasoning',
    provider: 'Anthropic'
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'Latest GPT-4 model with improved capabilities',
    provider: 'OpenAI'
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Faster, more affordable GPT-4 variant',
    provider: 'OpenAI'
  },
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    description: 'Google\'s advanced multimodal model',
    provider: 'Google'
  },
  {
    id: 'meta-llama/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    description: 'Meta\'s largest open-source model',
    provider: 'Meta'
  },
  {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    description: 'Mistral\'s most capable model',
    provider: 'Mistral AI'
  },
  {
    id: 'perplexity/llama-3.1-sonar-large-128k-online',
    name: 'Perplexity Sonar Large',
    description: 'Real-time web search capabilities',
    provider: 'Perplexity'
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    description: 'Alibaba\'s multilingual model',
    provider: 'Qwen'
  },
  {
    id: 'x-ai/grok-beta',
    name: 'xAI Grok Beta',
    description: 'xAI\'s conversational AI model',
    provider: 'xAI'
  }
];

// Model categories for better organization
export const modelCategories = {
  'Most Capable': [
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'meta-llama/llama-3.1-405b-instruct',
    'gemini-2.5-pro'
  ],
  'Fast & Affordable': [
    'openai/gpt-4o-mini',
    'anthropic/claude-3-haiku',
    'google/gemini-flash-1.5',
    'x-ai/grok-beta',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ],
  'Specialized': [
    'perplexity/llama-3.1-sonar-large-128k-online',
    'google/gemini-pro-1.5',
    'qwen/qwen-2.5-72b-instruct'
  ]
};