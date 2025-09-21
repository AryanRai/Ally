import React, { useState } from 'react';
import { Send, Loader2, CheckCircle, XCircle } from 'lucide-react';

export const ProviderTest: React.FC = () => {
  const [testMessage, setTestMessage] = useState('Hello! Can you tell me a short joke?');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<'ollama' | 'openrouter'>('ollama');
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  const loadModels = async () => {
    try {
      const allModels = [];
      
      // Load Ollama models
      try {
        const ollamaModels = await window.pip.ollama.getModels();
        const formattedOllamaModels = ollamaModels
          .filter(m => m.name)
          .map(m => ({
            ...m,
            id: m.name,
            provider: 'Ollama',
            type: 'local'
          }));
        allModels.push(...formattedOllamaModels);
      } catch (error) {
        console.warn('Failed to load Ollama models:', error);
      }
      
      // Load OpenRouter models
      try {
        if (typeof window.pip.ollama.getOpenRouterModels === 'function') {
          const openRouterModels = await window.pip.ollama.getOpenRouterModels();
          const formattedOpenRouterModels = openRouterModels
            .slice(0, 20) // Limit for testing
            .map(m => ({
              ...m,
              name: m.name || m.id,
              provider: 'OpenRouter',
              type: 'cloud'
            }));
          allModels.push(...formattedOpenRouterModels);
        } else {
          console.error('getOpenRouterModels is not a function, using fallback models');
          // Fallback: use popular models from config
          const { popularOpenRouterModels } = await import('../config/providers');
          const formattedFallbackModels = popularOpenRouterModels
            .slice(0, 10)
            .map(m => ({
              ...m,
              name: m.name,
              provider: 'OpenRouter',
              type: 'cloud'
            }));
          allModels.push(...formattedFallbackModels);
        }
      } catch (error) {
        console.warn('Failed to load OpenRouter models:', error);
      }
      
      setAvailableModels(allModels);
    } catch (error) {
      console.error('Failed to load models:', error);
      setAvailableModels([]);
    }
  };

  React.useEffect(() => {
    loadModels();
  }, []); // Load all models on mount

  const testProvider = async () => {
    if (!testMessage.trim()) return;
    
    setIsLoading(true);
    setError('');
    setResponse('');
    
    try {
      const messages = [{ role: 'user' as const, content: testMessage }];
      
      // Use selected model or fallback to defaults
      let model = selectedModel;
      if (!model) {
        // Auto-select based on available models
        const localModels = availableModels.filter(m => m.type === 'local');
        const cloudModels = availableModels.filter(m => m.type === 'cloud');
        
        if (selectedProvider === 'ollama' && localModels.length > 0) {
          model = localModels[0].id;
        } else if (selectedProvider === 'openrouter' && cloudModels.length > 0) {
          model = cloudModels[0].id;
        } else {
          model = 'llama3.2'; // Ultimate fallback
        }
      }
      
      console.log('Testing with model:', model);
      
      let fullResponse = '';
      await window.pip.ollama.streamChatWithThinking(messages, model, (chunk: any) => {
        if (chunk.type === 'response' || chunk.type === 'done') {
          fullResponse = chunk.content;
          setResponse(fullResponse);
        }
      });
      
    } catch (error: any) {
      setError(error.message || 'Failed to get response');
    } finally {
      setIsLoading(false);
    }
  };

  const [providerStatus, setProviderStatus] = useState<{
    ollama: boolean | null;
    openrouter: boolean | null;
  }>({ ollama: null, openrouter: null });

  const checkProviderStatus = async () => {
    const status = { ollama: null, openrouter: null };
    
    try {
      status.ollama = await window.pip.ollama.isAvailable();
    } catch (error) {
      status.ollama = false;
    }
    
    try {
      status.openrouter = await window.pip.ollama.isOpenRouterAvailable();
    } catch (error) {
      status.openrouter = false;
    }
    
    setProviderStatus(status);
  };

  React.useEffect(() => {
    checkProviderStatus();
  }, []);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Provider Integration Test</h2>
      
      {/* Provider Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Provider</label>
        <div className="flex gap-4">
          <button
            onClick={() => setSelectedProvider('ollama')}
            className={`px-4 py-2 rounded-lg border transition-colors ${
              selectedProvider === 'ollama'
                ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            Ollama (Local)
          </button>
          <button
            onClick={() => setSelectedProvider('openrouter')}
            className={`px-4 py-2 rounded-lg border transition-colors ${
              selectedProvider === 'openrouter'
                ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            OpenRouter (Cloud)
          </button>
        </div>
        
        {/* Status Indicators */}
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            {providerStatus.ollama === null ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : providerStatus.ollama ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            <span className="text-sm">
              Ollama: {providerStatus.ollama === null 
                ? 'Checking...' 
                : providerStatus.ollama 
                  ? 'Available' 
                  : 'Not available'
              }
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {providerStatus.openrouter === null ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : providerStatus.openrouter ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            <span className="text-sm">
              OpenRouter: {providerStatus.openrouter === null 
                ? 'Checking...' 
                : providerStatus.openrouter 
                  ? 'Available' 
                  : 'Not available'
              }
            </span>
          </div>
        </div>
      </div>

      {/* Model Selection */}
      {availableModels.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Model (All Providers)</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none bg-white"
          >
            <option value="">Choose a model...</option>
            
            {/* Group by provider */}
            {availableModels.filter(m => m.type === 'local').length > 0 && (
              <optgroup label="🏠 Local Ollama Models">
                {availableModels
                  .filter(m => m.type === 'local')
                  .map((model) => (
                    <option key={`local-${model.id}`} value={model.id}>
                      {model.name} (Local - {model.size ? `${(model.size / 1e9).toFixed(1)}GB` : 'Unknown size'})
                    </option>
                  ))}
              </optgroup>
            )}
            
            {availableModels.filter(m => m.type === 'cloud').length > 0 && (
              <optgroup label="☁️ OpenRouter Models">
                {availableModels
                  .filter(m => m.type === 'cloud')
                  .map((model) => (
                    <option key={`cloud-${model.id}`} value={model.id}>
                      {model.name} (${model.pricing?.completion || 'N/A'}/1K tokens)
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
          
          {selectedModel && (
            <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
              <strong>Selected:</strong> {selectedModel}
              <br />
              <span className="text-gray-600">
                {availableModels.find(m => m.id === selectedModel)?.type === 'local' 
                  ? '🏠 Local model - Free, private, offline'
                  : '☁️ Cloud model - Latest capabilities, usage-based pricing'
                }
              </span>
            </div>
          )}
        </div>
      )}

      {/* Test Message */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Test Message</label>
        <textarea
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
          rows={3}
          placeholder="Enter a test message..."
        />
      </div>

      {/* Test Button */}
      <button
        onClick={testProvider}
        disabled={isLoading || (!providerStatus.ollama && !providerStatus.openrouter)}
        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Testing...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Test Selected Model
          </>
        )}
      </button>

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Response Display */}
      {response && (
        <div className="mt-4">
          <label className="block text-sm font-medium mb-2">Response</label>
          <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg whitespace-pre-wrap">
            {response}
          </div>
        </div>
      )}
    </div>
  );
};