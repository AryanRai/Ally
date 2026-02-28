import React, { useState, useEffect } from 'react';
import { Key, Check, X, ExternalLink } from 'lucide-react';
import { ProviderConfig, defaultProviderConfig } from '../config/providers';

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
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      setTestStatus('idle');
      setTestError('');
    }
  }, [isOpen]);

  const loadConfig = async () => {
    try {
      const savedConfig = await window.pip.ollama.getConfig();
      if (savedConfig?.openRouterApiKey) {
        setApiKey(savedConfig.openRouterApiKey);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const handleSave = async () => {
    try {
      const savedConfig = await window.pip.ollama.getConfig();
      
      const serviceConfig = {
        ...savedConfig,
        openRouterApiKey: apiKey,
        preferredProvider: apiKey ? 'openrouter' : 'ollama',
      };

      await window.pip.ollama.updateConfig(serviceConfig);
      
      if (apiKey) {
        await window.pip.ollama.setProvider('openrouter');
      }

      onConfigChange({
        ...defaultProviderConfig,
        openrouter: { ...defaultProviderConfig.openrouter, apiKey },
        preferred: apiKey ? 'openrouter' : 'ollama',
      });
      onClose();
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const testConnection = async () => {
    if (!apiKey) return;
    
    setTestStatus('testing');
    setTestError('');
    
    try {
      // First update the config so the test uses the new key
      const savedConfig = await window.pip.ollama.getConfig();
      await window.pip.ollama.updateConfig({
        ...savedConfig,
        openRouterApiKey: apiKey,
      });
      
      // Now test the connection
      const result = await window.pip.ollama.testOpenRouterConnection();
      
      if (result.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(result.error || 'Connection failed');
      }
    } catch (error: any) {
      setTestStatus('error');
      setTestError(error.message || 'Connection failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            <h2 className="text-lg font-semibold">OpenRouter API Key</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">API Key</label>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                Get API Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestStatus('idle');
                }}
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

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <button
              onClick={testConnection}
              disabled={!apiKey || testStatus === 'testing'}
              className="px-4 py-2 text-sm bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {testStatus === 'testing' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </button>
            
            {testStatus === 'success' && (
              <div className="flex items-center gap-1 text-green-400 text-sm">
                <Check className="w-4 h-4" />
                Connected
              </div>
            )}
            
            {testStatus === 'error' && (
              <div className="flex items-center gap-1 text-red-400 text-sm">
                <X className="w-4 h-4" />
                Failed
              </div>
            )}
          </div>

          {testError && (
            <p className="text-xs text-red-400">{testError}</p>
          )}

          <p className="text-xs text-white/50">
            OpenRouter provides access to Claude, GPT-4, Gemini, and many other models with pay-per-use pricing.
          </p>
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
