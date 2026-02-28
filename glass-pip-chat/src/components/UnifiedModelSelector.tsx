import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, Server, Zap, Settings, Search, Filter } from 'lucide-react';
import { cn } from '../lib/utils';
import { ThemeUtils } from '../utils/themeUtils';
import { popularOpenRouterModels } from '../config/providers';

interface UnifiedModelSelectorProps {
  platform: string;
  theme: 'light' | 'dark';
  currentModel: string;
  onModelSelect: (model: string) => void;
  showSelector: boolean;
  onToggleSelector: () => void;
  className?: string;
  compact?: boolean;
  showProviderSettings?: () => void;
  windowSize?: 'S' | 'M' | 'L';
}

interface ModelInfo {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  type: 'local' | 'cloud';
  size?: number;
  pricing?: string;
  description?: string;
  isFree?: boolean;
}

interface ModelGroup {
  name: string;
  icon: React.ReactNode;
  models: ModelInfo[];
}

// Known providers for filtering
const PROVIDERS = [
  'All',
  'Anthropic',
  'OpenAI', 
  'Google',
  'Meta',
  'Mistral',
  'xAI',
  'DeepSeek',
  'Qwen',
  'Other'
];

export const UnifiedModelSelector: React.FC<UnifiedModelSelectorProps> = ({
  platform,
  theme,
  currentModel,
  onModelSelect,
  showSelector,
  onToggleSelector,
  className,
  compact = false,
  showProviderSettings,
  windowSize = 'M'
}) => {
  const [allModels, setAllModels] = useState<{
    ollama: any[];
    openrouter: any[];
    loading: boolean;
  }>({ ollama: [], openrouter: [], loading: false });
  
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    maxHeight: 300
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load models from both providers
  const loadAllModels = async () => {
    setAllModels(prev => ({ ...prev, loading: true }));
    
    const models = { ollama: [], openrouter: [], loading: false };
    
    // Load Ollama models
    try {
      if (window.pip?.ollama?.isAvailable) {
        const isOllamaAvailable = await window.pip.ollama.isAvailable();
        if (isOllamaAvailable) {
          const ollamaModels = await window.pip.ollama.getModels();
          models.ollama = ollamaModels.filter(m => m.name);
        }
      }
    } catch (error) {
      console.warn('Failed to load Ollama models:', error);
    }
    
    // Load OpenRouter models
    try {
      if (window.pip?.ollama?.getOpenRouterModels) {
        const openRouterModels = await window.pip.ollama.getOpenRouterModels();
        models.openrouter = openRouterModels;
      } else {
        models.openrouter = popularOpenRouterModels;
      }
    } catch (error) {
      console.warn('Failed to load OpenRouter models, using fallback:', error);
      models.openrouter = popularOpenRouterModels;
    }
    
    setAllModels(models);
  };

  // Load models on mount
  useEffect(() => {
    loadAllModels();
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (showSelector && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showSelector]);

  // Reset filters when closing
  useEffect(() => {
    if (!showSelector) {
      setSearchQuery('');
    }
  }, [showSelector]);

  // Update dropdown position when opened
  useEffect(() => {
    if (showSelector && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const dropdownWidth = 320; // w-80 = 20rem = 320px
      const availableHeight = viewportHeight - rect.bottom - 20;
      
      // Calculate left position - align to button's left edge, but ensure it stays in viewport
      let left = rect.left;
      
      // If dropdown would go off the right edge, align to right edge of button instead
      if (left + dropdownWidth > viewportWidth - 10) {
        left = Math.max(10, rect.right - dropdownWidth);
      }
      
      // If still going off left edge, just use 10px margin
      if (left < 10) {
        left = 10;
      }
      
      setDropdownPosition({
        top: rect.bottom + 5,
        left: left,
        maxHeight: Math.max(200, Math.min(400, availableHeight))
      });
    }
  }, [showSelector]);

  // Helper to check if model is free
  const isModelFree = (model: any): boolean => {
    if (!model.pricing) return false;
    const promptPrice = parseFloat(model.pricing.prompt || '0');
    const completionPrice = parseFloat(model.pricing.completion || '0');
    return promptPrice === 0 && completionPrice === 0;
  };

  // Helper to extract provider from model id
  const getProviderFromId = (id: string): string => {
    const providerMap: Record<string, string> = {
      'anthropic': 'Anthropic',
      'openai': 'OpenAI',
      'google': 'Google',
      'meta-llama': 'Meta',
      'meta': 'Meta',
      'mistralai': 'Mistral',
      'mistral': 'Mistral',
      'x-ai': 'xAI',
      'deepseek': 'DeepSeek',
      'qwen': 'Qwen',
      'alibaba': 'Qwen',
    };
    
    const prefix = id.split('/')[0]?.toLowerCase();
    return providerMap[prefix] || 'Other';
  };

  // Organize and filter models
  const modelGroups: ModelGroup[] = useMemo(() => {
    const ollamaModels: ModelInfo[] = allModels.ollama.map(model => ({
      id: model.name,
      name: model.name,
      displayName: model.name,
      provider: 'Ollama',
      type: 'local' as const,
      size: model.size,
      description: `Local model - ${(model.size / 1e9).toFixed(1)}GB`,
      isFree: true
    }));

    const openrouterModels: ModelInfo[] = allModels.openrouter.map(model => ({
      id: model.id,
      name: model.name || model.id,
      displayName: model.name || model.id,
      provider: getProviderFromId(model.id),
      type: 'cloud' as const,
      pricing: model.pricing?.completion,
      description: model.description || `${getProviderFromId(model.id)} model`,
      isFree: isModelFree(model)
    }));

    // Apply filters to OpenRouter models
    let filteredOpenRouter = openrouterModels;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredOpenRouter = filteredOpenRouter.filter(m => 
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        m.provider.toLowerCase().includes(query)
      );
    }
    
    // Free only filter
    if (showFreeOnly) {
      filteredOpenRouter = filteredOpenRouter.filter(m => m.isFree);
    }
    
    // Provider filter
    if (selectedProvider !== 'All') {
      filteredOpenRouter = filteredOpenRouter.filter(m => m.provider === selectedProvider);
    }

    // Also filter Ollama models by search
    let filteredOllama = ollamaModels;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredOllama = filteredOllama.filter(m => 
        m.name.toLowerCase().includes(query)
      );
    }

    return [
      {
        name: 'Local Models (Ollama)',
        icon: <Server className="w-4 h-4" />,
        models: filteredOllama
      },
      {
        name: 'Cloud Models (OpenRouter)',
        icon: <Zap className="w-4 h-4" />,
        models: filteredOpenRouter
      }
    ];
  }, [allModels, searchQuery, showFreeOnly, selectedProvider]);

  // Count free models
  const freeModelCount = useMemo(() => {
    return allModels.openrouter.filter(m => isModelFree(m)).length;
  }, [allModels.openrouter]);

  // Get current model display info
  const getCurrentModelInfo = () => {
    for (const group of modelGroups) {
      const model = group.models.find(m => m.id === currentModel || m.name === currentModel);
      if (model) {
        return {
          displayName: model.displayName,
          provider: model.provider,
          type: model.type
        };
      }
    }
    return {
      displayName: currentModel || 'Select Model',
      provider: 'Unknown',
      type: 'local' as const
    };
  };

  const currentModelInfo = getCurrentModelInfo();

  const handleModelSelect = (modelId: string) => {
    console.log('🎯 Unified Model Selected:', modelId);
    onModelSelect(modelId);
    onToggleSelector();
  };

  return (
    <>
      {/* Model Selector Button */}
      <button
        ref={buttonRef}
        onClick={onToggleSelector}
        className={cn(
          "flex items-center rounded-lg transition-all duration-200 flex-shrink-0",
          "hover:bg-white/10 border border-white/20",
          showSelector && "bg-blue-500/20 border-blue-500/50",
          // In S size, just show icon
          windowSize === 'S' ? "p-1" : "gap-1 px-1.5 py-1",
          compact && windowSize !== 'S' ? "text-xs max-w-[100px]" : "text-sm",
          className
        )}
        title={`Current model: ${currentModelInfo.displayName} (${currentModelInfo.provider})`}
      >
        <div className={cn(
          "flex items-center justify-center rounded flex-shrink-0",
          currentModelInfo.type === 'local' ? "text-green-400" : "text-blue-400"
        )}>
          {currentModelInfo.type === 'local' ? (
            <Server className="w-3 h-3" />
          ) : (
            <Zap className="w-3 h-3" />
          )}
        </div>
        
        {/* Hide model name in S size */}
        {windowSize !== 'S' && (
          <>
            <div className="flex flex-col items-start min-w-0 overflow-hidden">
              <div className={cn(
                "font-medium truncate w-full",
                compact ? "text-[10px]" : "text-sm max-w-28"
              )}>
                {currentModelInfo.displayName}
              </div>
              {!compact && (
                <div className="text-xs text-white/50 truncate max-w-28">
                  {currentModelInfo.provider}
                </div>
              )}
            </div>
            
            <div className="flex-shrink-0">
              {showSelector ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </div>
          </>
        )}
      </button>

      {/* Model Dropdown - Rendered via Portal */}
      {showSelector && createPortal(
        <>
          <div
            className="fixed inset-0 z-[999998]"
            onClick={onToggleSelector}
            style={{ pointerEvents: 'auto' }}
          />
          
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className={cn(
                "fixed w-80 z-[999999]",
                ThemeUtils.getModalClass(platform, theme)
              )}
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                pointerEvents: 'auto'
              } as React.CSSProperties}
            >
              <div className="p-3">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className={cn(
                    "text-sm font-medium",
                    ThemeUtils.getTextClass(platform, theme, 'primary')
                  )}>
                    Select Model
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={cn(
                        "p-1 rounded hover:bg-white/10 transition-colors",
                        showFilters && "bg-white/10",
                        ThemeUtils.getTextClass(platform, theme, 'secondary')
                      )}
                      title="Filters"
                    >
                      <Filter className="w-4 h-4" />
                    </button>
                    {showProviderSettings && (
                      <button
                        onClick={() => {
                          showProviderSettings();
                          onToggleSelector();
                        }}
                        className={cn(
                          "p-1 rounded hover:bg-white/10 transition-colors",
                          ThemeUtils.getTextClass(platform, theme, 'secondary')
                        )}
                        title="Provider Settings"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search models..."
                    className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Filters */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 space-y-2 overflow-hidden"
                    >
                      {/* Free Only Toggle */}
                      <button
                        onClick={() => setShowFreeOnly(!showFreeOnly)}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors text-sm",
                          showFreeOnly 
                            ? "bg-green-500/20 border-green-500/50 text-green-300"
                            : "bg-white/5 border-white/20 hover:bg-white/10"
                        )}
                      >
                        <span>Free Models Only</span>
                        <span className="text-xs text-white/50">({freeModelCount})</span>
                      </button>

                      {/* Provider Filter */}
                      <div className="flex flex-wrap gap-1">
                        {PROVIDERS.map(provider => (
                          <button
                            key={provider}
                            onClick={() => setSelectedProvider(provider)}
                            className={cn(
                              "px-2 py-1 text-xs rounded-md border transition-colors",
                              selectedProvider === provider
                                ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                                : "bg-white/5 border-white/20 hover:bg-white/10"
                            )}
                          >
                            {provider}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Active Filters Display */}
                {(showFreeOnly || selectedProvider !== 'All') && !showFilters && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {showFreeOnly && (
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded-full">
                        Free
                      </span>
                    )}
                    {selectedProvider !== 'All' && (
                      <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded-full">
                        {selectedProvider}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setShowFreeOnly(false);
                        setSelectedProvider('All');
                      }}
                      className="px-2 py-0.5 text-xs text-white/50 hover:text-white/70"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* Model Groups */}
                <div 
                  className="overflow-y-auto scrollbar-thin"
                  style={{ maxHeight: `${dropdownPosition.maxHeight - (showFilters ? 200 : 120)}px` }}
                >
                  {allModels.loading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span className="ml-2 text-sm text-white/70">Loading models...</span>
                    </div>
                  ) : (
                    modelGroups.map((group, groupIndex) => (
                      group.models.length > 0 && (
                        <div key={group.name} className={cn(groupIndex > 0 && "mt-4")}>
                          <div className={cn(
                            "flex items-center gap-2 px-2 py-1 text-xs font-medium mb-2",
                            ThemeUtils.getTextClass(platform, theme, 'secondary')
                          )}>
                            {group.icon}
                            {group.name}
                            <span className="text-white/40">({group.models.length})</span>
                          </div>
                          
                          <div className="space-y-1">
                            {group.models.slice(0, 20).map((model) => (
                              <button
                                key={model.id}
                                onClick={() => handleModelSelect(model.id)}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-lg transition-all duration-200",
                                  "hover:bg-white/10 border border-transparent",
                                  (currentModel === model.id || currentModel === model.name)
                                    ? "bg-blue-500/20 border-blue-500/50"
                                    : "hover:border-white/20"
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm truncate">
                                        {model.displayName}
                                      </span>
                                      {model.isFree && model.type === 'cloud' && (
                                        <span className="px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded">
                                          FREE
                                        </span>
                                      )}
                                      {(currentModel === model.id || currentModel === model.name) && (
                                        <Check className="w-3 h-3 text-blue-400 flex-shrink-0" />
                                      )}
                                    </div>
                                    <div className="text-xs text-white/50 truncate">
                                      {model.provider}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            ))}
                            
                            {group.models.length > 20 && (
                              <div className="px-3 py-2 text-xs text-white/50 text-center">
                                +{group.models.length - 20} more models
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    ))
                  )}

                  {/* No results */}
                  {!allModels.loading && modelGroups.every(g => g.models.length === 0) && (
                    <div className="py-8 text-center text-white/50 text-sm">
                      No models found
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </>,
        document.body
      )}
    </>
  );
};
