import { Ref, useState } from 'react';
import { Clipboard, ClipboardCopy, Cpu, FolderOpen, Lasso, LoaderCircle, Check, ArrowUp, Play, Square, Eye, ShieldCheck, ShieldAlert } from 'lucide-react';
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '@/components/ai-elements/prompt-input';
import ComposerTools from './ComposerTools';
import AgentSelectors from './AgentSelectors';
import AuroraGlow from '@/components/glow/AuroraGlow';
import AgentPresence from '@/components/glow/AgentPresence';
import type { OrbMood } from '@/components/glow/EnergyOrb';
import type { RobotStatus } from '@/components/glow/RobotAvatar';
import { useLook } from '@/lib/look';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';
import type { AgentPermission, AgentProvider } from '@/types/agent';
import type { ContextData } from '@/hooks/useContextMonitoring';

interface ChatInputProps {
  ref?: Ref<HTMLTextAreaElement>;
  input: string;
  setInput: (value: string) => void;
  onSend: (mode?: 'steer' | 'queue') => void;
  isTyping: boolean;
  workingStatus?: string;
  onStop: () => void;
  onResume?: () => void;
  /** The turn belongs to another app, so Ally can show it but not stop it */
  stopDisabledReason?: string;
  contextData: ContextData;
  onExplainClipboard: () => void;
  placeholder?: string;
  messages?: Message[];
  /** Ally is seeing or hearing: the orb morphs into the robot */
  sensing?: boolean;
  robotStatus?: RobotStatus;
  /** Voice: the orb toggles it, like Mary's live-mode orb */
  voice: {
    enabled: boolean;
    listening: boolean;
    onToggle: () => void;
  };
  /** Robot mode — DroidCore persona + robot MCP servers handed to the agent */
  robotMode?: boolean;
  onRobotModeToggle?: () => void;
  /** The agent behind this chat */
  agent: {
    label: string;
    provider: AgentProvider;
    model: string;
    folder: string;
    homeFolder?: string;
    recentFolders: string[];
    permission: AgentPermission;
    onPickFolder: () => void;
    onCyclePermission: () => void;
    onModel: (id: string) => void;
    onFolder: (folder: string) => void;
    onPermission: (permission: AgentPermission) => void;
  };
}

const PERMISSION: Record<AgentPermission, { text: string; title: string }> = {
  readonly: { text: 'read-only', title: 'Agent can read but not change files (click to change)' },
  edit: { text: 'can edit', title: 'Agent can edit files in the folder; risky commands may be blocked (click to change)' },
  full: { text: 'full access', title: 'Unrestricted files and fewer prompts; required browser confirmations still apply (click to change)' },
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

// Strip PromptInput's own box: the Mary-style dock below draws the frame instead
const BARE_GROUP =
  '[&>[data-slot=input-group]]:border-0! [&>[data-slot=input-group]]:bg-transparent! [&>[data-slot=input-group]]:ring-0! [&>[data-slot=input-group]]:shadow-none! [&>[data-slot=input-group]]:overflow-visible!';

/**
 * Composer: Orbit Mary's input dock (energy orb + pill field, aurora behind it
 * while the agent responds) on AI Elements' PromptInput, with Ally's agent
 * controls (circle, folder, permission, clipboard, robot) underneath.
 */
export default function ChatInput({
  ref,
  input,
  setInput,
  onSend,
  isTyping,
  workingStatus = 'Working…',
  onStop,
  onResume,
  stopDisabledReason,
  contextData,
  onExplainClipboard,
  placeholder = 'Ask the agent…',
  messages = [],
  sensing = false,
  robotStatus,
  voice,
  robotMode = false,
  onRobotModeToggle,
  agent,
}: ChatInputProps) {
  const [copied, setCopied] = useState(false);
  const { colors } = useLook();
  const glowing = isTyping || voice.listening;
  const mood: OrbMood = isTyping ? 'busy' : voice.listening ? 'listening' : 'idle';
  const canSend = !!input.trim();
  const normalized = (p?: string) => p?.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
  const folderLabel = agent.homeFolder && normalized(agent.folder) === normalized(agent.homeFolder) ? 'Home' : folderName(agent.folder);

  const copyChat = async () => {
    await navigator.clipboard.writeText(exportChat(messages, `${agent.label} · ${agent.model}`));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative border-t border-border">
      <AuroraGlow active={glowing} colors={colors} />

      <div className={cn('relative z-10 flex flex-col gap-2 px-2.5 pb-2.5 pt-2 transition-colors duration-500', glowing ? 'bg-black/45' : 'bg-black/20')}>
        {/* prxptn-style status line */}
        <div className="flex items-center gap-2 px-1">
          <span className={cn('size-1.5 shrink-0', robotMode ? 'bg-destructive' : 'bg-foreground', isTyping && 'animate-pulse')} />
          <AgentSelectors
            provider={agent.provider}
            model={agent.model}
            folder={agent.folder}
            homeFolder={agent.homeFolder}
            recentFolders={agent.recentFolders}
            permission={agent.permission}
            onModel={agent.onModel}
            onFolder={agent.onFolder}
            onPickFolder={agent.onPickFolder}
            onPermission={agent.onPermission}
            disabled={isTyping}
            prefix={robotMode ? <span className="px-label px-1 text-destructive/90">robot ·</span> : undefined}
          />
          {voice.listening && <span className="px-label shrink-0">· listening</span>}
        </div>
        {isTyping && <div role="status" className="flex min-w-0 items-center gap-1.5 px-1 text-xs text-foreground/80"><LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin" /><span className="truncate" title={workingStatus}>{workingStatus}</span></div>}

        <PromptInput
          onSubmit={() => {
            onSend(isTyping ? 'queue' : undefined);
          }}
          className={BARE_GROUP}
        >
          {/* Row 1 — Mary's dock: orb + field in a pill */}
          <div
            className={cn(
              'flex min-h-9 w-full items-center rounded-[18px] border px-1 transition-colors duration-150 focus-within:border-white/30',
              glowing ? 'border-white/20 bg-white/[0.04]' : 'border-white/10 bg-white/[0.06]'
            )}
          >
            <button
              type="button"
              onClick={voice.onToggle}
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110 active:scale-95"
              title={voice.enabled ? 'Voice on · click to stop listening' : 'Click to talk to the agent'}
              aria-pressed={voice.enabled}
            >
              <AgentPresence size={26} mood={mood} sensing={sensing || voice.listening} robotStatus={robotStatus} />
            </button>
            <PromptInputTextarea
              ref={ref}
              id="main-input"
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={event => {
                if (isTyping && event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (canSend) onSend(event.shiftKey ? 'steer' : 'queue');
                }
              }}
              placeholder={placeholder}
              className="max-h-32 min-h-0 flex-1 resize-none border-0 bg-transparent! px-2 py-2 text-[13px] font-light shadow-none focus-visible:ring-0"
            />
          </div>

          {/* Row 2 — Ally's agent controls + Mary-style send */}
          <PromptInputFooter className="px-0 pb-0 pt-1.5">
            <ComposerTools
              tools={[
                {
                  id: 'circle',
                  icon: <Lasso />,
                  label: 'Circle to ask',
                  detail: 'ctrl+shift+space',
                  onClick: () => window.pip?.circle.start(),
                },
                { id: 'folder', icon: <FolderOpen />, label: 'Working folder', detail: folderLabel, onClick: agent.onPickFolder },
                {
                  id: 'permission',
                  icon: agent.permission === 'readonly' ? <Eye /> : agent.permission === 'full' ? <ShieldAlert /> : <ShieldCheck />,
                  label: 'Permissions',
                  detail: PERMISSION[agent.permission].text,
                  danger: agent.permission === 'full',
                  onClick: agent.onCyclePermission,
                },
                {
                  id: 'explain',
                  icon: <Clipboard />,
                  label: 'Explain clipboard',
                  hidden: !contextData.clipboard,
                  onClick: onExplainClipboard,
                },
                {
                  id: 'robot',
                  icon: <Cpu />,
                  label: 'Robot mode',
                  detail: robotMode ? 'on' : 'off',
                  active: robotMode,
                  hidden: !onRobotModeToggle,
                  onClick: () => onRobotModeToggle?.(),
                },
                { id: 'copy', icon: copied ? <Check /> : <ClipboardCopy />, label: copied ? 'Copied' : 'Copy chat', onClick: copyChat },
              ]}
            />
            {isTyping && <>
              <button type="button" disabled={!canSend} onClick={() => onSend('steer')} title="Shift+Enter" className="rounded-full border border-white/20 px-3 py-1 text-xs disabled:opacity-40">Steer now</button>
              <button type="submit" disabled={!canSend} title="Enter · send after the current response" className="rounded-full border border-white/20 px-3 py-1 text-xs disabled:opacity-40">Queue</button>
            </>}
            <PromptInputSubmit
              size={isTyping ? 'sm' : 'icon-sm'}
              variant={isTyping ? 'outline' : 'default'}
              status={isTyping ? 'streaming' : 'ready'}
              onStop={onStop}
              onClick={onResume && !isTyping && !canSend ? event => { event.preventDefault(); onResume(); } : undefined}
              aria-label={isTyping ? 'Stop response' : onResume && !canSend ? 'Resume response' : 'Send message'}
              title={isTyping ? stopDisabledReason ?? 'Stop response' : onResume && !canSend ? 'Resume response' : 'Send message'}
              disabled={isTyping ? !!stopDisabledReason : !canSend && !onResume}
              className={cn(
                'h-[30px] shrink-0 rounded-full transition-colors',
                isTyping ? 'min-w-[72px] gap-2 border-white/20 bg-white/5 px-3 text-foreground/85 hover:bg-white/10' : 'w-[30px]',
                !isTyping && (canSend || onResume ? 'bg-foreground text-background hover:bg-foreground/85' : 'bg-white/10 text-muted-foreground')
              )}
            >
              {isTyping ? <><Square className="size-3" fill="currentColor" /><span className="text-xs">Stop</span></> : onResume && !canSend ? <Play className="size-3.5" /> : <ArrowUp className="size-3.5" strokeWidth={2.5} />}
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
