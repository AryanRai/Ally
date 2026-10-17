import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, Search, Bot, Terminal } from 'lucide-react';
import { cn } from '../lib/utils';
import { ThemeUtils } from '../utils/themeUtils';
import { AGENT_LABEL, AGENT_MODEL_PREFIX, AgentModel, AgentProvider } from '../types/agent';

interface UnifiedModelSelectorProps {
  platform: string;
  theme: 'light' | 'dark';
  currentModel: string;
  onModelSelect: (model: string) => void;
  showSelector: boolean;
  onToggleSelector: () => void;
  className?: string;
  compact?: boolean;
  windowSize?: 'S' | 'M' | 'L';
}

interface ModelOption {
  id: string;
  name: string;
  provider: AgentProvider;
  description?: string;
}

const PROVIDER_ICON: Record<AgentProvider, React.ReactNode> = {
  claude: <Bot className="w-4 h-4" />,
  codex: <Terminal className="w-4 h-4" />,
};

/** Picker for the agent + model behind the chat (Claude Code or Codex). */
export const UnifiedModelSelector: React.FC<UnifiedModelSelectorProps> = ({
  platform,
  theme,
  currentModel,
  onModelSelect,
  showSelector,
  onToggleSelector,
  className,
  compact = false,
  windowSize = 'M',
}) => {
  const [models, setModels] = useState<Record<AgentProvider, AgentModel[]>>({ claude: [], codex: [] });
  const [missing, setMissing] = useState<AgentProvider[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, maxHeight: 300 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const agent = window.pip?.agent;
    if (!agent) return;
    (async () => {
      const status = await agent.status();
      const next: Record<AgentProvider, AgentModel[]> = { claude: [], codex: [] };
      const notFound: AgentProvider[] = [];
      for (const p of ['claude', 'codex'] as const) {
        if (status[p].available) next[p] = await agent.listModels(p);
        else notFound.push(p);
      }
      setModels(next);
      setMissing(notFound);
    })().catch(err => console.warn('Agent backends unavailable:', err));
  }, []);

  useEffect(() => {
    if (!showSelector) {
      setSearchQuery('');
      return;
    }
    const focusTimer = setTimeout(() => searchInputRef.current?.focus(), 100);
    const position = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dropdownWidth = Math.min(320, window.innerWidth - 20);
      const left = Math.min(rect.left, window.innerWidth - dropdownWidth - 10);
      setDropdownPosition({
        top: rect.bottom + 5,
        left: Math.max(10, left),
        maxHeight: Math.max(120, Math.min(400, window.innerHeight - rect.bottom - 20)),
      });
    };
    position();
    window.addEventListener('resize', position);
    return () => { clearTimeout(focusTimer); window.removeEventListener('resize', position); };
  }, [showSelector]);

  const groups = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return (['claude', 'codex'] as const).map(provider => ({
      provider,
      options: models[provider]
        .map<ModelOption>(m => ({ id: AGENT_MODEL_PREFIX[provider] + m.id, name: m.name, provider, description: m.description }))
        .filter(m => !q || `${AGENT_LABEL[provider]} ${m.name}`.toLowerCase().includes(q)),
    }));
  }, [models, searchQuery]);

  const current = groups.flatMap(g => g.options).find(m => m.id === currentModel);
  const currentLabel = current ? `${AGENT_LABEL[current.provider]} · ${current.name}` : 'Select agent';

  const handleSelect = (id: string) => {
    onModelSelect(id);
    onToggleSelector();
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={onToggleSelector}
        className={cn(
          'flex items-center rounded-lg transition-all duration-200 shrink-0',
          'hover:bg-white/10 border border-white/20',
          showSelector && 'bg-white/10 border-white/25',
          windowSize === 'S' ? 'p-1' : 'gap-1 px-1.5 py-1',
          compact && windowSize !== 'S' ? 'text-xs max-w-[120px]' : 'text-sm',
          className
        )}
        title={`Current: ${currentLabel}`}
      >
        <Bot className="w-3 h-3 text-white shrink-0" />
        {windowSize !== 'S' && (
          <>
            <span className={cn('font-medium truncate', compact ? 'text-[10px]' : 'text-sm max-w-28')}>{currentLabel}</span>
            {showSelector ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
          </>
        )}
      </button>

      {showSelector && createPortal(
        <>
          <div className="fixed inset-0 z-999998" onClick={onToggleSelector} style={{ pointerEvents: 'auto' }} />
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className={cn('fixed w-80 max-w-[calc(100vw-20px)] z-999999', ThemeUtils.getModalClass(platform, theme))}
              style={{ top: dropdownPosition.top, left: dropdownPosition.left, pointerEvents: 'auto' } as React.CSSProperties}
            >
              <div className="p-3">
                <div className={cn('text-sm font-medium mb-3', ThemeUtils.getTextClass(platform, theme, 'primary'))}>
                  Select agent
                </div>

                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search models..."
                    className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm focus:border-white/25 focus:outline-hidden"
                  />
                </div>

                <div className="overflow-y-auto scrollbar-thin space-y-4" style={{ maxHeight: `${dropdownPosition.maxHeight - 110}px` }}>
                  {groups.map(group => (
                    <div key={group.provider}>
                      <div className={cn('flex items-center gap-2 px-2 py-1 text-xs font-medium mb-1', ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                        {PROVIDER_ICON[group.provider]}
                        {AGENT_LABEL[group.provider]}
                      </div>
                      {missing.includes(group.provider) ? (
                        <div className="px-3 py-1 text-xs text-white/40">CLI not found. Set its path in Settings.</div>
                      ) : (
                        <div className="space-y-1">
                          {group.options.map(model => (
                            <button
                              key={model.id}
                              onClick={() => handleSelect(model.id)}
                              className={cn(
                                'w-full text-left px-3 py-2 rounded-lg transition-all duration-200 border',
                                currentModel === model.id ? 'bg-white/10 border-white/25' : 'border-transparent hover:bg-white/10 hover:border-white/20'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">{model.name}</span>
                                {currentModel === model.id && <Check className="w-3 h-3 text-white shrink-0" />}
                              </div>
                              {model.description && <div className="text-xs text-white/50 truncate">{model.description}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
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
