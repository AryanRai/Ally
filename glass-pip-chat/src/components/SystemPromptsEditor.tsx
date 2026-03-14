/**
 * System Prompts Editor Component
 *
 * Allows viewing and editing system prompts for all five chat modes.
 * Prompts are defined in systemPrompts.ts; this editor only handles
 * display and localStorage persistence.
 */

import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Copy, Check, Wrench, MessageSquare, Bot, Terminal, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  PromptMode,
  DEFAULT_PROMPTS,
  STORAGE_KEYS,
  getPrompt,
  savePrompt,
  resetPrompt,
} from '../services/systemPrompts';

interface SystemPromptsEditorProps {
  className?: string;
  theme: 'light' | 'dark';
  platform: string;
  onPromptUpdate?: (promptId: string, newPrompt: string) => void;
}

interface TabDef {
  id: PromptMode;
  label: string;
  icon: React.ReactNode;
  description: string;
  accentClass: string;
}

const TABS: TabDef[] = [
  {
    id: 'basic',
    label: 'Basic Chat',
    icon: <MessageSquare className="w-3 h-3" />,
    description: 'Used for regular conversations without tool access.',
    accentClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  {
    id: 'tool',
    label: 'Tool Mode',
    icon: <Wrench className="w-3 h-3" />,
    description: 'Used when a single tool call is needed. Defines when to use (and not use) tools.',
    accentClass: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  {
    id: 'agentic',
    label: 'Agentic',
    icon: <Bot className="w-3 h-3" />,
    description: 'Multi-step agentic loop. Controls planning, step limits, and error handling.',
    accentClass: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  {
    id: 'ptc',
    label: 'PTC',
    icon: <Terminal className="w-3 h-3" />,
    description: 'Programmatic Tool Calling — LLM writes a JS script, sandbox executes it.',
    accentClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  {
    id: 'robot',
    label: 'Robot',
    icon: <Cpu className="w-3 h-3" />,
    description: 'Robot Control Mode. Safety contract + DroidCore Comms v4.0 intent list.',
    accentClass: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
];

export const SystemPromptsEditor: React.FC<SystemPromptsEditorProps> = ({
  className = '',
  theme,
  platform,
  onPromptUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<PromptMode>('basic');
  const [prompts, setPrompts] = useState<Record<PromptMode, string>>(() => ({
    basic: DEFAULT_PROMPTS.basic,
    tool: DEFAULT_PROMPTS.tool,
    agentic: DEFAULT_PROMPTS.agentic,
    ptc: DEFAULT_PROMPTS.ptc,
    robot: DEFAULT_PROMPTS.robot,
  }));
  const [hasChanges, setHasChanges] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load saved prompts on mount
  useEffect(() => {
    const loaded: Record<PromptMode, string> = {
      basic: getPrompt('basic'),
      tool: getPrompt('tool'),
      agentic: getPrompt('agentic'),
      ptc: getPrompt('ptc'),
      robot: getPrompt('robot'),
    };
    setPrompts(loaded);
  }, []);

  const currentPrompt = prompts[activeTab];

  const handleChange = (value: string) => {
    setPrompts((prev) => ({ ...prev, [activeTab]: value }));
    setHasChanges(true);
    setSaved(false);
  };

  const handleSave = () => {
    savePrompt(activeTab, prompts[activeTab]);
    onPromptUpdate?.(activeTab, prompts[activeTab]);
    setHasChanges(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    resetPrompt(activeTab);
    setPrompts((prev) => ({ ...prev, [activeTab]: DEFAULT_PROMPTS[activeTab] }));
    setHasChanges(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDark = platform === 'win32' || theme === 'dark';
  const activeTabDef = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className={cn('space-y-3', className)}>
      <h3 className={cn('text-sm font-medium', isDark ? 'text-white/80' : 'text-black/80')}>
        System Prompts
      </h3>

      {/* Tab Selector */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setHasChanges(false); }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors border',
              activeTab === tab.id
                ? tab.accentClass
                : isDark
                  ? 'border-white/10 text-white/60 hover:bg-white/5'
                  : 'border-black/10 text-black/60 hover:bg-black/5',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Description */}
      <p className={cn('text-xs', isDark ? 'text-white/50' : 'text-gray-500')}>
        {activeTabDef.description}
      </p>

      {/* Editor */}
      <div className="relative">
        <textarea
          value={currentPrompt}
          onChange={(e) => handleChange(e.target.value)}
          className={cn(
            'w-full h-48 p-3 rounded-lg border text-xs font-mono resize-y',
            isDark
              ? 'bg-black/30 border-white/20 text-white/90 placeholder-white/40'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500',
          )}
          placeholder="Enter system prompt..."
        />

        {/* Action buttons */}
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={handleCopy}
            className={cn(
              'p-1.5 rounded transition-colors',
              copied
                ? 'bg-green-500/20 text-green-400'
                : isDark
                  ? 'bg-black/30 hover:bg-white/10 text-white/60'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600',
            )}
            title="Copy"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Save/Reset buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleReset}
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
            isDark ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100',
          )}
        >
          <RotateCcw className="w-3 h-3" />
          Reset to Default
        </button>

        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={cn(
            'flex items-center gap-1 px-3 py-1 text-xs rounded transition-colors',
            saved
              ? 'bg-green-500/20 text-green-400'
              : hasChanges
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : isDark
                  ? 'bg-white/10 text-white/40 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
          )}
        >
          {saved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Info */}
      <div className={cn(
        'p-2 rounded text-xs',
        isDark
          ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
          : 'bg-blue-50 border border-blue-200 text-blue-700',
      )}>
        💡 Changes are saved to localStorage and take effect on the next message.
        {activeTab === 'tool' || activeTab === 'agentic'
          ? ' The available tool list is appended automatically.'
          : ''}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Backwards-compatible helper (used by GlassChatPiP legacy code)
// ---------------------------------------------------------------------------
export const getSystemPrompts = () => ({
  basic: getPrompt('basic'),
  tools: getPrompt('tool'),
  agentic: getPrompt('agentic'),
  ptc: getPrompt('ptc'),
  robot: getPrompt('robot'),
});

