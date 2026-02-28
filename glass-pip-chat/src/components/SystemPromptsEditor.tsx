/**
 * System Prompts Editor Component
 * 
 * Allows viewing and editing system prompts for different chat modes
 */

import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Copy, Check, Wrench, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';

interface SystemPromptsEditorProps {
  className?: string;
  theme: 'light' | 'dark';
  platform: string;
  onPromptUpdate?: (promptId: string, newPrompt: string) => void;
}

// Storage keys
const STORAGE_KEYS = {
  basicPrompt: 'ally-prompt-basic',
  toolPrompt: 'ally-prompt-tools'
};

// Default prompts
const DEFAULT_PROMPTS = {
  basic: `You are a helpful AI assistant. Respond naturally and helpfully to user questions and requests. Be concise but informative.`,
  
  tools: `You are a helpful AI assistant with access to tools. When you need to use a tool, output a tool call in this exact format:

<tool_call>
{"name": "tool_name", "parameters": {"param1": "value1"}}
</tool_call>

IMPORTANT RULES:
1. Only use tools when actually needed - for casual chat, just respond normally
2. Use tools for: file operations, current time, calculations, system info
3. Do NOT use tools for: greetings, simple questions, general conversation
4. After receiving tool results, incorporate them into your response
5. Explain your reasoning when using tools`
};

export const SystemPromptsEditor: React.FC<SystemPromptsEditorProps> = ({
  className = '',
  theme,
  platform,
  onPromptUpdate
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'tools'>('basic');
  const [basicPrompt, setBasicPrompt] = useState(DEFAULT_PROMPTS.basic);
  const [toolPrompt, setToolPrompt] = useState(DEFAULT_PROMPTS.tools);
  const [hasChanges, setHasChanges] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load saved prompts on mount
  useEffect(() => {
    const savedBasic = localStorage.getItem(STORAGE_KEYS.basicPrompt);
    const savedTool = localStorage.getItem(STORAGE_KEYS.toolPrompt);
    
    if (savedBasic) setBasicPrompt(savedBasic);
    if (savedTool) setToolPrompt(savedTool);
  }, []);

  const currentPrompt = activeTab === 'basic' ? basicPrompt : toolPrompt;
  const setCurrentPrompt = activeTab === 'basic' ? setBasicPrompt : setToolPrompt;

  const handleChange = (value: string) => {
    setCurrentPrompt(value);
    setHasChanges(true);
    setSaved(false);
  };

  const handleSave = () => {
    if (activeTab === 'basic') {
      localStorage.setItem(STORAGE_KEYS.basicPrompt, basicPrompt);
      onPromptUpdate?.('basic', basicPrompt);
    } else {
      localStorage.setItem(STORAGE_KEYS.toolPrompt, toolPrompt);
      onPromptUpdate?.('tools', toolPrompt);
    }
    setHasChanges(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (activeTab === 'basic') {
      setBasicPrompt(DEFAULT_PROMPTS.basic);
      localStorage.removeItem(STORAGE_KEYS.basicPrompt);
    } else {
      setToolPrompt(DEFAULT_PROMPTS.tools);
      localStorage.removeItem(STORAGE_KEYS.toolPrompt);
    }
    setHasChanges(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <h3 className={cn(
        'text-sm font-medium',
        platform === 'win32' ? 'text-white/80' : theme === 'dark' ? 'text-white/80' : 'text-black/80'
      )}>
        System Prompts
      </h3>

      {/* Tab Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('basic')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors',
            activeTab === 'basic'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : platform === 'win32'
                ? 'border border-white/10 text-white/60 hover:bg-white/5'
                : theme === 'dark'
                  ? 'border border-white/10 text-white/60 hover:bg-white/5'
                  : 'border border-black/10 text-black/60 hover:bg-black/5'
          )}
        >
          <MessageSquare className="w-3 h-3" />
          Basic Chat
        </button>
        <button
          onClick={() => setActiveTab('tools')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors',
            activeTab === 'tools'
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
              : platform === 'win32'
                ? 'border border-white/10 text-white/60 hover:bg-white/5'
                : theme === 'dark'
                  ? 'border border-white/10 text-white/60 hover:bg-white/5'
                  : 'border border-black/10 text-black/60 hover:bg-black/5'
          )}
        >
          <Wrench className="w-3 h-3" />
          Tool Calling
        </button>
      </div>

      {/* Description */}
      <p className={cn(
        'text-xs',
        platform === 'win32' ? 'text-white/50' : theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
      )}>
        {activeTab === 'basic' 
          ? 'Used for regular conversations without tool access.'
          : 'Used when tools are enabled. Defines how the AI should use tools.'}
      </p>

      {/* Editor */}
      <div className="relative">
        <textarea
          value={currentPrompt}
          onChange={(e) => handleChange(e.target.value)}
          className={cn(
            'w-full h-40 p-3 rounded-lg border text-xs font-mono resize-y',
            platform === 'win32'
              ? 'bg-black/30 border-white/20 text-white/90 placeholder-white/40'
              : theme === 'dark'
                ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
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
                : platform === 'win32'
                  ? 'bg-black/30 hover:bg-white/10 text-white/60'
                  : theme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
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
            platform === 'win32'
              ? 'text-white/60 hover:bg-white/10'
              : theme === 'dark'
                ? 'text-gray-400 hover:bg-gray-700'
                : 'text-gray-600 hover:bg-gray-100'
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
                : platform === 'win32'
                  ? 'bg-white/10 text-white/40 cursor-not-allowed'
                  : theme === 'dark'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          )}
        >
          {saved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Info */}
      <div className={cn(
        'p-2 rounded text-xs',
        platform === 'win32'
          ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
          : theme === 'dark'
            ? 'bg-blue-900/20 border border-blue-800/30 text-blue-300'
            : 'bg-blue-50 border border-blue-200 text-blue-700'
      )}>
        💡 {activeTab === 'tools' 
          ? 'The tool list is automatically added when tools are enabled. Edit the instructions above to change how the AI uses tools.'
          : 'This prompt is used when the tool toggle is disabled.'}
      </div>
    </div>
  );
};

// Export helper to get the current prompts
export const getSystemPrompts = () => ({
  basic: localStorage.getItem(STORAGE_KEYS.basicPrompt) || DEFAULT_PROMPTS.basic,
  tools: localStorage.getItem(STORAGE_KEYS.toolPrompt) || DEFAULT_PROMPTS.tools
});
