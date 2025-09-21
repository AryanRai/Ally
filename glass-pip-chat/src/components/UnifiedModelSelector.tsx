import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, Server, Zap, Settings } from 'lucide-react';
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
}

interface ModelGroup {
  name: string;
  icon: React.ReactNode;
  models: Array<{
    id: string;
    name: string;
    displayName: string;
    provider: string;
    type: 'local' | 'cloud';
    size?: number;
    pricing?: string;
    description?: string;
  }>;
}

export const UnifiedModelSelector: React.FC<UnifiedModelSelectorProps> = ({
  platform,
  theme,
  currentModel,
  onModelSelect,
  showSelector,
  onToggleSelector,
  className,
  compact = false,
  showProviderSettings
}) => {
  const [allModels, setAllModels] = useState<{
    ollama: any[];
    openrouter: any[];
    loading: boolean;
  }>({ ollama: [], openrouter: [], loading: false });
  
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    right: 0,
    maxHeight: 300
  });
  
  const buttonRef = useRef<HTMLButtonElement>(null);

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
        // Fallback to popular models
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

  // Update dropdown position when opened
  useEffect(() => {
    if (showSelector && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const availableHeight = viewportHeight - rect.bottom - 20;
      
      setDropdownPosition({
        top: rect.bottom + 5,
        right: window.innerWidth - rect.right,
        maxHeight: Math.max(200, Math.min(400, availableHeight))
      });
    }
  }, [showSelector]);

  // Organize models into groups
  const modelGroups: ModelGroup[] = [
    {
      name: 'Local Models (Ollama)',
      icon: <Server className="w-4 h-4" />,
      models: allModels.ollama.map(model => ({
        id: model.name,
        name: model.name,
        displayName: model.name,
        provider: 'Ollama',
        type: 'local' as const,
        size: model.size,
        description: `Local model - ${(model.size / 1e9).toFixed(1)}GB`
      }))
    },
    {
      name: 'Cloud Models (OpenRouter)',
      icon: <Zap className="w-4 h-4" />,
      models: allModels.openrouter.map(model => ({
        id: model.id,
        name: model.name || model.id,
        displayName: model.name || model.id,
        provider: model.provider || 'OpenRouter',
        type: 'cloud' as const,
        pricing: model.pricing?.completion,
        description: model.description || `${model.provider || 'OpenRouter'} model`
      }))
    }
  ];

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
          "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200",
          "hover:bg-white/10 border border-white/20",
          showSelector && "bg-blue-500/20 border-blue-500/50",
          compact ? "text-xs" : "text-sm",
          className
        )}
        title={`Current model: ${currentModelInfo.displayName} (${currentModelInfo.provider})`}
      >
        {/* Provider Icon */}
        <div className={cn(
          "flex items-center justify-center rounded",
          currentModelInfo.type === 'local' ? "text-green-400" : "text-blue-400"
        )}>
          {currentModelInfo.type === 'local' ? (
            <Server className="w-3 h-3" />
          ) : (
            <Zap className="w-3 h-3" />
          )}
        </div>
        
        {/* Model Name */}
        <div className="flex flex-col items-start min-w-0">
          <div className={cn(
            "font-medium truncate max-w-32",
            compact ? "text-xs" : "text-sm"
          )}>
            {currentModelInfo.displayName}
          </div>
          {!compact && (
            <div className="text-xs text-white/50 truncate">
              {currentModelInfo.provider}
            </div>
          )}
        </div>
        
        {/* Dropdown Arrow */}
        <div className="flex-shrink-0">
          {showSelector ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </div>
      </button>

      {/* Model Dropdown - Rendered via Portal */}
      {showSelector && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[999998]"
            onClick={onToggleSelector}
            style={{ pointerEvents: 'auto' }}
          />
          
          {/* Dropdown */}
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
                right: dropdownPosition.right,
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

                {/* Model Groups */}
                <div 
                  className="overflow-y-auto scrollbar-thin"
                  style={{ maxHeight: `${dropdownPosition.maxHeight - 60}px` }}
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
                          {/* Group Header */}
                          <div className={cn(
                            "flex items-center gap-2 px-2 py-1 text-xs font-medium mb-2",
                            ThemeUtils.getTextClass(platform, theme, 'secondary')
                          )}>
                            {group.icon}
                            {group.name}
                            <span className="text-white/40">({group.models.length})</span>
                          </div>
                          
                          {/* Models */}
                          <div className="space-y-1">
                            {group.models.slice(0, 10).map((model) => (
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
                                      {(currentModel === model.id || currentModel === model.name) && (
                                        <Check className="w-3 h-3 text-blue-400 flex-shrink-0" />
                                      )}
                                    </div>
                                    <div className="text-xs text-white/60 truncate">
                                      {model.description}
                                    </div>
                                    {model.pricing && (
                                      <div className="text-xs text-green-400">
                                        ${model.pricing}/1K tokens
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                            
                            {group.models.length > 10 && (
                              <div className="px-3 py-2 text-xs text-white/50 text-center">
                                +{group.models.length - 10} more models available
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    ))
                  )}
                </div>

                {/* Footer */}
                {showProviderSettings && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <button
                      onClick={() => {
                        showProviderSettings();
                        onToggleSelector();
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-sm rounded-lg transition-colors",
                        "bg-blue-500/20 hover:bg-blue-500/30 text-blue-300",
                        "flex items-center justify-center gap-2"
                      )}
                    >
                      <Settings className="w-4 h-4" />
                      Configure Providers
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </>,
        document.body
      )}
    </>
  );
};