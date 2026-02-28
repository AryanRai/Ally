/**
 * System Prompts Editor Component
 * 
 * Allows viewing and editing system prompts for different chat modes
 */

import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface SystemPrompt {
  id: string;
  name: string;
  description: string;
  prompt: string;
  isDefault: boolean;
}

interface SystemPromptsEditorProps {
  className?: string;
  theme: 'light' | 'dark';
  platform: string;
  onPromptUpdate?: (promptId: string, newPrompt: string) => void;
}

export const SystemPromptsEditor: React.FC<SystemPromptsEditorProps> = ({
  className = '',
  theme,
  platform,
  onPromptUpdate
}) => {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [editingPrompt, setEditingPrompt] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copiedId, setCopiedId] = useState<string>('');

  // Load system prompts from services
  useEffect(() => {
    loadSystemPrompts();
  }, []);

  const loadSystemPrompts = async () => {
    // Get prompts from different services
    const defaultPrompts: SystemPrompt[] = [
      {
        id: 'basic-chat',
        name: 'Basic Chat',
        description: 'Default system prompt for basic conversation',
        prompt: `You are a helpful AI assistant. Respond naturally and helpfully to user questions and requests. Be concise but informative.`,
        isDefault: true
      },
      {
        id: 'tool-calling',
        name: 'Tool Calling',
        description: 'System prompt for tool-aware conversations',
        prompt: getCurrentToolCallingPrompt(),
        isDefault: true
      }
    ];

    // Load custom prompts from localStorage
    const customPrompts = JSON.parse(localStorage.getItem('ally-custom-prompts') || '[]');
    
    setPrompts([...defaultPrompts, ...customPrompts]);
    if (defaultPrompts.length > 0) {
      setSelectedPrompt(defaultPrompts[0].id);
      setEditingPrompt(defaultPrompts[0].prompt);
    }
  };

  const getCurrentToolCallingPrompt = () => {
    // Try to get from global tool calling service if available
    try {
      return (window as any).toolCallingService?.getCurrentToolCallPrompt?.() || getDefaultToolCallingPrompt();
    } catch {
      return getDefaultToolCallingPrompt();
    }
  };

  const getDefaultToolCallingPrompt = () => {
    // Try to load saved prompt first
    const saved = localStorage.getItem('ally-prompt-tool-calling');
    if (saved) return saved;
    
    return `You are an AI assistant with access to various tools that can help you complete tasks and answer questions.

IMPORTANT: Only use tools when they are actually needed to complete the user's request. For casual conversation, greetings, simple questions you can answer directly, or general chat, respond normally WITHOUT using any tools.

Use tools ONLY when:
- The user explicitly asks for file operations (read, write, list files)
- The user asks for current time/date information
- The user asks for calculations that require computation
- The user asks for weather information with a specific location
- The user asks for system information
- The user requests actions that require external data or operations

DO NOT use tools for:
- Casual greetings like "hey", "hello", "hi"
- Simple math you can do mentally (like 2+2=4)
- General conversation or questions you can answer from your knowledge
- Vague requests without specific actionable tasks

When you do need to use tools:
1. Analyze the user's request to determine what tools are actually necessary
2. Use only the appropriate tool(s) with correct parameters
3. Wait for the tool results
4. Incorporate the results into your response
5. Use additional tools only if the results indicate they're needed

Always explain your reasoning when using tools.`;
  };

  const handlePromptSelect = (promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
      setSelectedPrompt(promptId);
      setEditingPrompt(prompt.prompt);
      setIsEditing(false);
    }
  };

  const handleSave = () => {
    const promptIndex = prompts.findIndex(p => p.id === selectedPrompt);
    if (promptIndex !== -1) {
      const updatedPrompts = [...prompts];
      updatedPrompts[promptIndex] = {
        ...updatedPrompts[promptIndex],
        prompt: editingPrompt
      };
      
      setPrompts(updatedPrompts);
      
      // Apply prompt to the appropriate service
      try {
        switch (selectedPrompt) {
          case 'tool-calling':
            if ((window as any).toolCallingService?.updateToolCallPrompt) {
              (window as any).toolCallingService.updateToolCallPrompt(editingPrompt);
            }
            break;
        }
      } catch (error) {
        console.warn('Failed to update service prompt:', error);
      }
      
      // Save custom prompts to localStorage
      const customPrompts = updatedPrompts.filter(p => !p.isDefault);
      localStorage.setItem('ally-custom-prompts', JSON.stringify(customPrompts));
      
      // Also save the current prompt for this type
      localStorage.setItem(`ally-prompt-${selectedPrompt}`, editingPrompt);
      
      // Notify parent component
      onPromptUpdate?.(selectedPrompt, editingPrompt);
      
      setIsEditing(false);
    }
  };

  const handleReset = () => {
    const prompt = prompts.find(p => p.id === selectedPrompt);
    if (prompt) {
      setEditingPrompt(prompt.prompt);
      setIsEditing(false);
    }
  };

  const handleCopy = async (promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
      await navigator.clipboard.writeText(prompt.prompt);
      setCopiedId(promptId);
      setTimeout(() => setCopiedId(''), 2000);
    }
  };

  const selectedPromptData = prompts.find(p => p.id === selectedPrompt);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className={cn(
          'text-lg font-semibold',
          theme === 'dark' ? 'text-white' : 'text-gray-900'
        )}>
          System Prompts
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              showPreview
                ? 'bg-blue-500/20 text-blue-400'
                : theme === 'dark'
                  ? 'hover:bg-white/10 text-gray-400'
                  : 'hover:bg-black/10 text-gray-600'
            )}
            title={showPreview ? 'Hide preview' : 'Show preview'}
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Prompt Selector */}
      <div className="space-y-2">
        <label className={cn(
          'text-sm font-medium',
          theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
        )}>
          Select Prompt
        </label>
        <select
          value={selectedPrompt}
          onChange={(e) => handlePromptSelect(e.target.value)}
          className={cn(
            'w-full p-2 rounded-lg border text-sm',
            theme === 'dark'
              ? 'bg-gray-800 border-gray-600 text-white'
              : 'bg-white border-gray-300 text-gray-900'
          )}
        >
          {prompts.map((prompt) => (
            <option key={prompt.id} value={prompt.id}>
              {prompt.name} {prompt.isDefault ? '(Default)' : '(Custom)'}
            </option>
          ))}
        </select>
      </div>

      {/* Prompt Description */}
      {selectedPromptData && (
        <div className={cn(
          'p-3 rounded-lg text-sm',
          theme === 'dark'
            ? 'bg-gray-800/50 text-gray-300'
            : 'bg-gray-50 text-gray-600'
        )}>
          {selectedPromptData.description}
        </div>
      )}

      {/* Prompt Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={cn(
            'text-sm font-medium',
            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
          )}>
            Prompt Content
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopy(selectedPrompt)}
              className={cn(
                'p-1.5 rounded transition-colors text-xs',
                copiedId === selectedPrompt
                  ? 'bg-green-500/20 text-green-400'
                  : theme === 'dark'
                    ? 'hover:bg-white/10 text-gray-400'
                    : 'hover:bg-black/10 text-gray-600'
              )}
              title="Copy prompt"
            >
              {copiedId === selectedPrompt ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
            {isEditing && (
              <>
                <button
                  onClick={handleReset}
                  className={cn(
                    'p-1.5 rounded transition-colors text-xs',
                    theme === 'dark'
                      ? 'hover:bg-white/10 text-gray-400'
                      : 'hover:bg-black/10 text-gray-600'
                  )}
                  title="Reset changes"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
                <button
                  onClick={handleSave}
                  className="p-1.5 rounded transition-colors text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                  title="Save changes"
                >
                  <Save className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>

        <textarea
          value={editingPrompt}
          onChange={(e) => {
            setEditingPrompt(e.target.value);
            setIsEditing(true);
          }}
          className={cn(
            'w-full h-64 p-3 rounded-lg border text-sm font-mono resize-y',
            theme === 'dark'
              ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
          )}
          placeholder="Enter your system prompt here..."
        />
      </div>

      {/* Preview */}
      {showPreview && selectedPromptData && (
        <div className="space-y-2">
          <label className={cn(
            'text-sm font-medium',
            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
          )}>
            Preview
          </label>
          <div className={cn(
            'p-3 rounded-lg text-sm whitespace-pre-wrap max-h-32 overflow-y-auto',
            theme === 'dark'
              ? 'bg-gray-800 border border-gray-600 text-gray-300'
              : 'bg-gray-50 border border-gray-200 text-gray-700'
          )}>
            {editingPrompt || 'No prompt content'}
          </div>
        </div>
      )}

      {/* Status */}
      {isEditing && (
        <div className={cn(
          'p-2 rounded text-xs',
          theme === 'dark'
            ? 'bg-yellow-900/20 text-yellow-300 border border-yellow-500/20'
            : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
        )}>
          ⚠️ You have unsaved changes. Click Save to apply them.
        </div>
      )}

      <div className={cn(
        'text-xs',
        theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
      )}>
        💡 System prompts control how the AI behaves. Default prompts are restored on app restart unless saved as custom prompts.
      </div>
    </div>
  );
};