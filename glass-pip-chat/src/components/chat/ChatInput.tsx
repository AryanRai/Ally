import { forwardRef, useState } from 'react';
import { CornerDownLeft, Square, Clipboard, Plus, X, ClipboardCopy, Cpu, FolderOpen, Lasso } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import { Message } from '../../types/chat';
import type { AgentPermission } from '../../types/agent';
import type { ContextData } from '../../hooks/useContextMonitoring';

interface ChatInputProps {
  platform: string;
  theme: 'light' | 'dark';
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  isTyping: boolean;
  onStop: () => void;
  contextData: ContextData;
  onExplainClipboard: () => void;
  placeholder?: string;
  messages?: Message[];
  /** Robot mode — DroidCore persona + HowYouSeeMe MCP handed to the agent */
  robotMode?: boolean;
  onRobotModeToggle?: () => void;
  /** The agent behind this chat */
  agent?: {
    label: string;
    model: string;
    folder: string;
    permission: AgentPermission;
    onPickFolder: () => void;
    onCyclePermission: () => void;
  };
}

const PERMISSION_LABEL: Record<AgentPermission, { text: string; title: string; cls: string }> = {
  readonly: { text: 'Read-only', title: 'Agent can read but not change files (click to change)', cls: 'bg-white/5 border-white/15 text-white/60' },
  edit: { text: 'Can edit', title: 'Agent can edit files in the folder; risky commands may be blocked (click to change)', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
  full: { text: 'Full access', title: 'Agent runs anything without asking (click to change)', cls: 'bg-red-500/15 border-red-500/30 text-red-300' },
};

function folderName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

function exportChat(messages: Message[], agentLabel: string): string {
  const lines = [`=== CHAT EXPORT ===`, `Exported: ${new Date().toLocaleString()}`, `Agent: ${agentLabel}`, ''];
  for (const msg of messages) {
    lines.push(`── [${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.role.toUpperCase()} ──`);
    const text = msg.content.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => `[THINKING]\n${inner.trim()}\n[/THINKING]\n`).trim();
    if (text) lines.push(text);
    for (const seg of msg.metadata?.segments ?? []) {
      if (seg.type === 'tool' && seg.toolExecution) {
        lines.push(`  [TOOL ${seg.toolExecution.name} · ${seg.toolExecution.status}] ${JSON.stringify(seg.toolExecution.parameters ?? {})}`);
      }
    }
    lines.push('');
  }
  lines.push('=== END ===');
  return lines.join('\n');
}

const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(({
  platform,
  theme,
  input,
  setInput,
  onSend,
  isTyping,
  onStop,
  contextData,
  onExplainClipboard,
  placeholder = 'Balalalala',
  messages = [],
  robotMode = false,
  onRobotModeToggle,
  agent,
}, ref) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyChat = async () => {
    try {
      await navigator.clipboard.writeText(exportChat(messages, agent ? `${agent.label} · ${agent.model}` : 'none'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy chat:', err);
    }
  };

  const mode = robotMode
    ? { dot: 'bg-red-400', label: 'Robot', extra: agent ? `· ${agent.label} · DroidCore` : '· DroidCore' }
    : agent
      ? { dot: 'bg-purple-400', label: agent.label, extra: `· ${agent.model} · ${folderName(agent.folder)}` }
      : { dot: 'bg-gray-400', label: 'No agent', extra: '· pick Claude Code or Codex above' };

  return (
    <div className={cn('border-t p-3', ThemeUtils.getBorderClass(platform, theme))}>
      {/* Mode indicator bar */}
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', mode.dot)} />
        <span className="text-[10px] text-white/50 truncate">
          <span className="text-white/70 font-medium">{mode.label}</span>{' '}
          <span className="text-white/30">{mode.extra}</span>
        </span>
      </div>

      {/* Agent folder + permission, clipboard context */}
      <div className="flex flex-wrap gap-1 mb-2">
        {agent && (
          <>
            <button
              onClick={agent.onPickFolder}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 transition-colors max-w-[180px]"
              title={`Working folder: ${agent.folder}\nClick to change`}
            >
              <FolderOpen className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{folderName(agent.folder)}</span>
            </button>
            <button
              onClick={agent.onCyclePermission}
              className={cn('px-2 py-1 text-xs rounded-lg border transition-colors hover:brightness-125', PERMISSION_LABEL[agent.permission].cls)}
              title={PERMISSION_LABEL[agent.permission].title}
            >
              {PERMISSION_LABEL[agent.permission].text}
            </button>
          </>
        )}
        <button
          onClick={() => window.pip?.circle.start()}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-gradient-to-r from-blue-500/20 to-pink-500/20 hover:from-blue-500/30 hover:to-pink-500/30 border border-purple-400/30 transition-colors"
          title="Circle anything on screen to ask about it (Ctrl+Shift+Space, or shake the cursor)"
        >
          <Lasso className="w-3 h-3" />
          Circle
        </button>
        {contextData.clipboard && (
          <button
            onClick={onExplainClipboard}
            className="px-2 py-1 text-xs rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 transition-colors"
            title="Ask about clipboard content"
          >
            <Clipboard className="w-3 h-3 inline mr-1" />
            Explain
          </button>
        )}
      </div>

      {/* Expandable extra toolbar */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setShowToolbar(!showToolbar)}
          className={cn('p-1 rounded-lg transition-colors', showToolbar ? 'bg-white/15 text-white/80' : 'hover:bg-white/10 text-white/40')}
          title={showToolbar ? 'Hide toolbar' : 'More options'}
        >
          {showToolbar ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </button>

        {showToolbar && (
          <div className="flex flex-wrap items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-150">
            <button
              onClick={handleCopyChat}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg transition-colors',
                copied
                  ? 'bg-green-500/20 border border-green-500/30 text-green-300'
                  : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white/80'
              )}
              title="Copy the full chat"
            >
              <ClipboardCopy className="w-3 h-3" />
              {copied ? 'Copied!' : 'Copy Chat'}
            </button>

            {onRobotModeToggle && (
              <button
                onClick={onRobotModeToggle}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg transition-colors border',
                  robotMode ? 'bg-red-500/20 border-red-500/30 text-red-300' : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/60'
                )}
                title={robotMode
                  ? 'Robot Mode ON: the agent gets the DroidCore persona and the HowYouSeeMe MCP tools'
                  : 'Robot Mode OFF: enable for DroidCore + HowYouSeeMe perception'}
              >
                <Cpu className="w-3 h-3" />
                Robot
              </button>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          onSend();
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={ref}
          id="main-input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholder}
          className={cn('flex-1 px-3 py-2 rounded-xl text-sm', platform !== 'win32' && 'backdrop-blur-md', ThemeUtils.getInputClass(platform, theme))}
        />
        <button
          type="submit"
          disabled={!input.trim() && !isTyping}
          onClick={e => {
            if (isTyping) {
              e.preventDefault();
              onStop();
            }
          }}
          className={cn(
            'p-2 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed',
            platform !== 'win32' && 'backdrop-blur-md',
            isTyping ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300' : ThemeUtils.getBackgroundClass(platform, theme, 'hover')
          )}
          title={isTyping ? 'Stop' : 'Send'}
        >
          {isTyping ? <Square className="w-4 h-4" /> : <CornerDownLeft className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;
