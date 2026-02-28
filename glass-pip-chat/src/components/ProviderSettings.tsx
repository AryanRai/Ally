import React, { useState, useEffect } from 'react';
import { Key, Check, X, ExternalLink, Sparkles, Cloud } from 'lucide-react';
import { ProviderConfig, defaultProviderConfig } from '../config/providers';
import { cn } from '../lib/utils';

interface ProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChange: (config: ProviderConfig) => void;
}

type ProviderTab = 'openrouter' | 'gemini';

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({
  isOpen,
  onClose,
  onConfigChange
}) => {
  const [activeTab, setActiveTab] = useState<ProviderTab>('openrouter');
  
  // OpenRouter state
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [openRouterTestStatus, setOpenRouterTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [openRouterTestError, setOpenRouterTestError] = useState('');
  
  // Gemini state
  const [geminiKey, setGeminiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [geminiTestError, setGeminiTestError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      setOpenRouterTestStatus('idle');
      setOpenRouterTestError('');
      setGeminiTestStatus('idle');
      setGeminiTestError('');
    }
  }, [isOpen]);

  const loadConfig = async () => {
    try {
      const savedConfig = await window.pip.ollama.getConfig();
      if (savedConfig?.openRouterApiKey) {
        setOpenRouterKey(savedConfig.openRouterApiKey);
      }
      if (savedConfig?.geminiApiKey) {
        setGeminiKey(savedConfig.geminiApiKey);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const handleSave = async () => {
    try {
      const savedConfig = await window.pip.ollama.getConfig();
      
      // Determine preferred provider based on which keys are set
      let preferredProvider: 'ollama' | 'openrouter' | 'gemini' = 'ollama';
      if (geminiKey && activeTab === 'gemini') {
        preferredProvider = 'gemini';
      } else if (openRouterKey && activeTab === 'openrouter') {
        preferredProvider = 'openrouter';
      } else if (geminiKey) {
        preferredProvider = 'gemini';
      } else if (openRouterKey) {
        preferredProvider = 'openrouter';
      }
      
      const serviceConfig = {
        ...savedConfig,
        openRouterApiKey: openRouterKey,
        geminiApiKey: geminiKey,
        preferredProvider,
      };

      await window.pip.ollama.updateConfig(serviceConfig);
      await window.pip.ollama.setProvider(preferredProvider);

      onConfigChange({
        ...defaultProviderConfig,
        openrouter: { ...defaultProviderConfig.openrouter, apiKey: openRouterKey },
        gemini: { ...defaultProviderConfig.gemini, apiKey: geminiKey },
        preferred: preferredProvider,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const testOpenRouterConnection = async () => {
    if (!openRouterKey) return;
    
    setOpenRouterTestStatus('testing');
    setOpenRouterTestError('');
    
    try {
      const savedConfig = await window.pip.ollama.getConfig();
      await window.pip.ollama.updateConfig({
        ...savedConfig,
        openRouterApiKey: openRouterKey,
      });
      
      const result = await window.pip.ollama.testOpenRouterConnection();
      
      if (result.success) {
        setOpenRouterTestStatus('success');
      } else {
        setOpenRouterTestStatus('error');
        setOpenRouterTestError(result.error || 'Connection failed');
      }
    } catch (error: any) {
      setOpenRouterTestStatus('error');
      setOpenRouterTestError(error.message || 'Connection failed');
    }
  };

  const testGeminiConnection = async () => {
    if (!geminiKey) return;
    
    setGeminiTestStatus('testing');
    setGeminiTestError('');
    
    try {
      const savedConfig = await window.pip.ollama.getConfig();
      await window.pip.ollama.updateConfig({
        ...savedConfig,
        geminiApiKey: geminiKey,
      });
      
      const result = await window.pip.ollama.testGeminiConnection();
      
      if (result.success) {
        setGeminiTestStatus('success');
      } else {
        setGeminiTestStatus('error');
        setGeminiTestError(result.error || 'Connection failed');
      }
    } catch (error: any) {
      setGeminiTestStatus('error');
      setGeminiTestError(error.message || 'Connection failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Provider Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4 p-1 bg-white/5 rounded-lg">
          <button
            onClick={() => setActiveTab('openrouter')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              activeTab === 'openrouter' 
                ? "bg-blue-500/30 text-blue-300" 
                : "hover:bg-white/10 text-white/70"
            )}
          >
            <Cloud className="w-4 h-4" />
            OpenRouter
          </button>
          <button
            onClick={() => setActiveTab('gemini')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              activeTab === 'gemini' 
                ? "bg-purple-500/30 text-purple-300" 
                : "hover:bg-white/10 text-white/70"
            )}
          >
            <Sparkles className="w-4 h-4" />
            Gemini
          </button>
        </div>

        {/* OpenRouter Tab */}
        {activeTab === 'openrouter' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">OpenRouter API Key</label>
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
                  type={showOpenRouterKey ? "text" : "password"}
                  value={openRouterKey}
                  onChange={(e) => {
                    setOpenRouterKey(e.target.value);
                    setOpenRouterTestStatus('idle');
                  }}
                  className="w-full px-3 py-2 pr-10 bg-white/10 border border-white/20 rounded-lg focus:border-blue-500 focus:outline-none"
                  placeholder="sk-or-..."
                />
                <button
                  type="button"
                  onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/70"
                >
                  {showOpenRouterKey ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={testOpenRouterConnection}
                disabled={!openRouterKey || openRouterTestStatus === 'testing'}
                className="px-4 py-2 text-sm bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {openRouterTestStatus === 'testing' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </button>
              
              {openRouterTestStatus === 'success' && (
                <div className="flex items-center gap-1 text-green-400 text-sm">
                  <Check className="w-4 h-4" />
                  Connected
                </div>
              )}
              
              {openRouterTestStatus === 'error' && (
                <div className="flex items-center gap-1 text-red-400 text-sm">
                  <X className="w-4 h-4" />
                  Failed
                </div>
              )}
            </div>

            {openRouterTestError && (
              <p className="text-xs text-red-400">{openRouterTestError}</p>
            )}

            <p className="text-xs text-white/50">
              OpenRouter provides access to Claude, GPT-4, Llama, and many other models with pay-per-use pricing.
            </p>
          </div>
        )}

        {/* Gemini Tab */}
        {activeTab === 'gemini' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Google Gemini API Key</label>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                >
                  Get API Key <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="relative">
                <input
                  type={showGeminiKey ? "text" : "password"}
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    setGeminiTestStatus('idle');
                  }}
                  className="w-full px-3 py-2 pr-10 bg-white/10 border border-white/20 rounded-lg focus:border-purple-500 focus:outline-none"
                  placeholder="AIza..."
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/70"
                >
                  {showGeminiKey ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={testGeminiConnection}
                disabled={!geminiKey || geminiTestStatus === 'testing'}
                className="px-4 py-2 text-sm bg-purple-500/20 hover:bg-purple-500/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {geminiTestStatus === 'testing' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </button>
              
              {geminiTestStatus === 'success' && (
                <div className="flex items-center gap-1 text-green-400 text-sm">
                  <Check className="w-4 h-4" />
                  Connected
                </div>
              )}
              
              {geminiTestStatus === 'error' && (
                <div className="flex items-center gap-1 text-red-400 text-sm">
                  <X className="w-4 h-4" />
                  Failed
                </div>
              )}
            </div>

            {geminiTestError && (
              <p className="text-xs text-red-400">{geminiTestError}</p>
            )}

            <p className="text-xs text-white/50">
              Google Gemini provides direct access to Gemini 2.0 Flash, Gemini 1.5 Pro, and other Google AI models. Free tier available.
            </p>
            
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <p className="text-xs text-purple-300">
                💡 Gemini 2.0 Flash Live supports real-time voice conversations. This will be available in a future update.
              </p>
            </div>
          </div>
        )}

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
