import React, { useState, useEffect } from 'react';
import { Settings, Key, Server, Check, X, ExternalLink } from 'lucide-react';
import { ProviderConfig, defaultProviderConfig, popularOpenRouterModels, modelCategories } from '../config/providers';

interface ProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange: (config: ProviderConfig) => void;
}

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({
  isOpen,
  onClose,
  onConfigChange
}) => {
  const [config, setConfig] = useState<ProviderConfig>(defaultProviderConfig);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [openRouterStatus, setOpenRouterStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [testingConnection, setTestingConnection] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [allModels, setAllModels] = useState<{
    ollama: any[];
    openrouter: any[];
    loading: boolean;
  }>({ ollama: [], openrouter: [], loading: false });
  const [selectedModel, setSelectedModel] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      checkProviderStatus();
    }
  }, [isOpen]);

  // Load models when provider status changes or API key is added
  useEffect(() => {
    if (isOpen && (ollamaStatus !== 'checking' || openRouterStatus !== 'checking')) {
      loadAllModels();
    }
  }, [isOpen, ollamaStatus, openRouterStatus, config.openrouter.apiKey]);

  // Set initial selected model based on config
  useEffect(() => {
    if (config.preferred === 'ollama') {
      setSelectedModel(config.ollama.defaultModel);
    } else {
      setSelectedModel(config.openrouter.defaultModel);
    }
  }, [config.preferred, config.ollama.defaultModel, config.openrouter.defaultModel]);

  const loadConfig = async () => {
    try {
      const savedConfig = await window.pip.ollama.getConfig();
      if (savedConfig) {
        // Convert old config format to new format
        const newConfig: ProviderConfig = {
          ollama: {
            baseUrl: savedConfig.ollamaBaseUrl || savedConfig.baseUrl || defaultProviderConfig.ollama.baseUrl,
            defaultModel: savedConfig.ollamaDefaultModel || savedConfig.defaultModel || defaultProviderConfig.ollama.defaultModel,
            timeout: savedConfig.ollamaTimeout || savedConfig.timeout || defaultProviderConfig.ollama.timeout,
            streamTimeout: savedConfig.ollamaStreamTimeout || savedConfig.streamTimeout || defaultProviderConfig.ollama.streamTimeout,
          },
          openrouter: {
            apiKey: savedConfig.openRouterApiKey || defaultProviderConfig.openrouter.apiKey,
            baseUrl: savedConfig.openRouterBaseUrl || defaultProviderConfig.openrouter.baseUrl,
            defaultModel: savedConfig.openRouterDefaultModel || defaultProviderConfig.openrouter.defaultModel,
            timeout: savedConfig.openRouterTimeout || defaultProviderConfig.openrouter.timeout,
          },
          preferred: savedConfig.preferredProvider || defaultProviderConfig.preferred,
        };
        setConfig(newConfig);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const checkProviderStatus = async () => {
    // Check Ollama
    try {
      const isOllamaAvailable = await window.pip.ollama.isAvailable();
      setOllamaStatus(isOllamaAvailable ? 'available' : 'unavailable');
    } catch (error) {
      setOllamaStatus('unavailable');
    }

    // Check OpenRouter
    try {
      const isOpenRouterAvailable = await window.pip.ollama.isOpenRouterAvailable();
      setOpenRouterStatus(isOpenRouterAvailable ? 'available' : 'unavailable');
    } catch (error) {
      setOpenRouterStatus('unavailable');
    }
  };

  const loadAllModels = async () => {
    setAllModels(prev => ({ ...prev, loading: true }));

    const models = { ollama: [], openrouter: [], loading: false };

    // Debug: Check what's available
    console.log('window.pip:', window.pip);
    console.log('window.pip.ollama:', window.pip?.ollama);
    console.log('Available methods:', Object.keys(window.pip?.ollama || {}));

    // Load Ollama models
    try {
      if (ollamaStatus === 'available') {
        const ollamaModels = await window.pip.ollama.getModels();
        models.ollama = ollamaModels.filter(m => m.name);
      }
    } catch (error) {
      console.warn('Failed to load Ollama models:', error);
    }

    // Load OpenRouter models
    try {
      if (config.openrouter.apiKey) {
        // Check if method exists
        if (typeof window.pip.ollama.getOpenRouterModels === 'function') {
          const openRouterModels = await window.pip.ollama.getOpenRouterModels();
          console.log('🔍 Loaded OpenRouter models:', openRouterModels.slice(0, 5)); // Log first 5 models
          models.openrouter = openRouterModels;
        } else {
          console.error('getOpenRouterModels is not a function');
          // Fallback: use popular models from config
          models.openrouter = popularOpenRouterModels;
        }
      } else {
        console.log('🔑 No OpenRouter API key, using popular models fallback');
        // Fallback: use popular models from config
        models.openrouter = popularOpenRouterModels;
      }
    } catch (error) {
      console.warn('Failed to load OpenRouter models:', error);
      // Fallback: use popular models from config
      models.openrouter = popularOpenRouterModels;
    }

    setAllModels(models);
  };

  const handleSave = async () => {
    try {
      // Update config with selected model
      const updatedConfig = { ...config };
      if (selectedModel) {
        console.log('🎯 Processing selected model:', selectedModel);
        console.log('📋 Available OpenRouter models:', allModels.openrouter.map(m => m.id));
        console.log('📋 Available Ollama models:', allModels.ollama.map(m => m.name));
        
        // Determine if selected model is from OpenRouter or Ollama
        const isOpenRouterModel = allModels.openrouter.some(m => m.id === selectedModel);
        const isOllamaModel = allModels.ollama.some(m => m.name === selectedModel);

        console.log('🔍 Model detection:', { selectedModel, isOpenRouterModel, isOllamaModel });

        if (isOpenRouterModel) {
          updatedConfig.openrouter.defaultModel = selectedModel;
          updatedConfig.preferred = 'openrouter';
          console.log('✅ Set as OpenRouter model');
        } else if (isOllamaModel) {
          updatedConfig.ollama.defaultModel = selectedModel;
          updatedConfig.preferred = 'ollama';
          console.log('✅ Set as Ollama model');
        } else {
          console.warn('⚠️ Model not found in either provider, keeping current preference');
        }
      }

      // Convert to service config format
      const serviceConfig = {
        ollamaBaseUrl: updatedConfig.ollama.baseUrl,
        ollamaDefaultModel: updatedConfig.ollama.defaultModel,
        ollamaTimeout: updatedConfig.ollama.timeout,
        ollamaStreamTimeout: updatedConfig.ollama.streamTimeout,
        openRouterApiKey: updatedConfig.openrouter.apiKey,
        openRouterBaseUrl: updatedConfig.openrouter.baseUrl,
        openRouterDefaultModel: updatedConfig.openrouter.defaultModel,
        openRouterTimeout: updatedConfig.openrouter.timeout,
        preferredProvider: updatedConfig.preferred,
      };

      await window.pip.ollama.updateConfig(serviceConfig);
      await window.pip.ollama.setProvider(updatedConfig.preferred);

      onConfigChange(updatedConfig);
      onClose();
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const testConnection = async (provider: 'ollama' | 'openrouter') => {
    setTestingConnection(true);
    try {
      if (provider === 'ollama') {
        const isAvailable = await window.pip.ollama.isAvailable();
        setOllamaStatus(isAvailable ? 'available' : 'unavailable');
      } else {
        const isAvailable = await window.pip.ollama.isOpenRouterAvailable();
        setOpenRouterStatus(isAvailable ? 'available' : 'unavailable');
      }
    } catch (error) {
      if (provider === 'ollama') {
        setOllamaStatus('unavailable');
      } else {
        setOpenRouterStatus('unavailable');
      }
    }
    setTestingConnection(false);
  };

  const StatusIcon = ({ status }: { status: 'checking' | 'available' | 'unavailable' }) => {
    switch (status) {
      case 'checking':
        return <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      case 'available':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'unavailable':
        return <X className="w-4 h-4 text-red-500" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Provider Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium mb-3">Preferred Provider</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfig(prev => ({ ...prev, preferred: 'ollama' }))}
                className={`p-4 rounded-lg border transition-all ${config.preferred === 'ollama'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-white/20 hover:border-white/30'
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Ollama</span>
                  <StatusIcon status={ollamaStatus} />
                </div>
                <p className="text-xs text-white/70">Local AI models</p>
              </button>

              <button
                onClick={() => setConfig(prev => ({ ...prev, preferred: 'openrouter' }))}
                className={`p-4 rounded-lg border transition-all ${config.preferred === 'openrouter'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-white/20 hover:border-white/30'
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">OpenRouter</span>
                  <StatusIcon status={openRouterStatus} />
                </div>
                <p className="text-xs text-white/70">Cloud AI models</p>
              </button>
            </div>
          </div>

          {/* Ollama Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <Server className="w-4 h-4" />
                Ollama Configuration
              </h3>
              <button
                onClick={() => testConnection('ollama')}
                disabled={testingConnection}
                className="px-3 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors disabled:opacity-50"
              >
                Test Connection
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Base URL</label>
                <input
                  type="text"
                  value={config.ollama.baseUrl}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    ollama: { ...prev.ollama, baseUrl: e.target.value }
                  }))}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:border-blue-500 focus:outline-none"
                  placeholder="http://localhost:11434"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Current Default Model</label>
                <input
                  type="text"
                  value={config.ollama.defaultModel}
                  readOnly
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white/70"
                  placeholder="Use model selector below"
                />
                <p className="text-xs text-white/50 mt-1">Use the unified model selector below to change</p>
              </div>
            </div>
          </div>

          {/* OpenRouter Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <Key className="w-4 h-4" />
                OpenRouter Configuration
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs bg-green-500/20 hover:bg-green-500/30 rounded-lg transition-colors flex items-center gap-1"
                >
                  Get API Key <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={() => testConnection('openrouter')}
                  disabled={testingConnection || !config.openrouter.apiKey}
                  className="px-3 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors disabled:opacity-50"
                >
                  Test Connection
                </button>
                <button
                  onClick={async () => {
                    if (window.pip?.ollama?.testOpenRouterConnection) {
                      const result = await window.pip.ollama.testOpenRouterConnection();
                      alert(result.success ? 'Connection successful!' : `Connection failed: ${result.error}`);
                    }
                  }}
                  disabled={testingConnection || !config.openrouter.apiKey}
                  className="px-3 py-1 text-xs bg-green-500/20 hover:bg-green-500/30 rounded-lg transition-colors disabled:opacity-50"
                >
                  Test API
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={config.openrouter.apiKey}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    openrouter: { ...prev.openrouter, apiKey: e.target.value }
                  }))}
                  className="w-full px-3 py-2 pr-10 bg-white/10 border border-white/20 rounded-lg focus:border-blue-500 focus:outline-none"
                  placeholder="sk-or-..."
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/70"
                >
                  {showApiKey ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>


          </div>

          {/* Unified Model Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                🤖 Model Selection
              </h3>
              <button
                onClick={loadAllModels}
                disabled={allModels.loading}
                className="px-3 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30 rounded-lg transition-colors disabled:opacity-50"
              >
                {allModels.loading ? 'Loading...' : 'Refresh Models'}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Select Model (from all providers)
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:border-blue-500 focus:outline-none"
                disabled={allModels.loading}
              >
                <option value="">Choose a model...</option>

                {/* Ollama Models */}
                {allModels.ollama.length > 0 && (
                  <optgroup label="🏠 Local Ollama Models">
                    {allModels.ollama.map(model => (
                      <option key={`ollama-${model.name}`} value={model.name}>
                        {model.name} (Local - {(model.size / 1e9).toFixed(1)}GB)
                      </option>
                    ))}
                  </optgroup>
                )}

                {/* OpenRouter Models by Category */}
                {allModels.openrouter.length > 0 && (
                  <>
                    <optgroup label="🚀 Most Capable (OpenRouter)">
                      {allModels.openrouter
                        .filter(model =>
                          model.id.includes('claude-3.5-sonnet') ||
                          model.id.includes('gpt-4o') ||
                          model.id.includes('llama-3.1-405b')
                        )
                        .slice(0, 5)
                        .map(model => (
                          <option key={`openrouter-${model.id}`} value={model.id}>
                            {model.name || model.id} (${model.pricing?.completion || 'N/A'}/1K tokens)
                          </option>
                        ))}
                    </optgroup>

                    <optgroup label="⚡ Fast & Affordable (OpenRouter)">
                      {allModels.openrouter
                        .filter(model =>
                          model.id.includes('gpt-4o-mini') ||
                          model.id.includes('claude-3-haiku') ||
                          model.id.includes('gemini-flash')
                        )
                        .slice(0, 5)
                        .map(model => (
                          <option key={`openrouter-${model.id}`} value={model.id}>
                            {model.name || model.id} (${model.pricing?.completion || 'N/A'}/1K tokens)
                          </option>
                        ))}
                    </optgroup>

                    <optgroup label="🔬 Specialized (OpenRouter)">
                      {allModels.openrouter
                        .filter(model =>
                          model.id.includes('perplexity') ||
                          model.id.includes('qwen') ||
                          model.id.includes('deepseek')
                        )
                        .slice(0, 5)
                        .map(model => (
                          <option key={`openrouter-${model.id}`} value={model.id}>
                            {model.name || model.id} (${model.pricing?.completion || 'N/A'}/1K tokens)
                          </option>
                        ))}
                    </optgroup>

                    <optgroup label="📋 All OpenRouter Models">
                      {allModels.openrouter
                        .slice(0, 50) // Limit to first 50 to avoid overwhelming the dropdown
                        .map(model => (
                          <option key={`openrouter-all-${model.id}`} value={model.id}>
                            {model.name || model.id} (${model.pricing?.completion || 'N/A'}/1K tokens)
                          </option>
                        ))}
                    </optgroup>
                  </>
                )}
              </select>

              {selectedModel && (
                <div className="mt-2 p-3 bg-white/5 rounded-lg">
                  <div className="text-sm">
                    <strong>Selected:</strong> {selectedModel}
                    <br />
                    <span className="text-white/70">
                      {allModels.ollama.some(m => m.name === selectedModel)
                        ? '🏠 Local Ollama model - Free, private, offline capable'
                        : '☁️ OpenRouter model - Cloud-based, latest capabilities'
                      }
                    </span>
                  </div>
                </div>
              )}

              {allModels.loading && (
                <div className="mt-2 text-sm text-white/70 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  Loading models from providers...
                </div>
              )}
            </div>
          </div>

          {/* Popular Models Info */}
          {config.preferred === 'openrouter' && (
            <div className="bg-white/5 rounded-lg p-4">
              <h4 className="font-medium mb-3">Popular Models</h4>
              <div className="grid gap-2">
                {popularOpenRouterModels.slice(0, 4).map(model => (
                  <div key={model.id} className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium">{model.name}</span>
                      <span className="text-white/50 ml-2">({model.provider})</span>
                    </div>
                    <button
                      onClick={() => setConfig(prev => ({
                        ...prev,
                        openrouter: { ...prev.openrouter, defaultModel: model.id }
                      }))}
                      className="px-2 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 rounded transition-colors"
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white/70 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};