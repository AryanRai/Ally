import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ChevronDown, Clipboard, GripVertical, Lasso, Maximize2, MoreHorizontal, Square, Volume2, VolumeX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';
import AgentPresence from '@/components/glow/AgentPresence';
import type { OrbMood } from '@/components/glow/EnergyOrb';
import type { RobotPulse, RobotStatus } from '@/components/glow/RobotAvatar';
import CollapsedChatPreview from './CollapsedChatPreview';
import CollapsedResponsePreview from './CollapsedResponsePreview';
import { UnifiedModelSelector } from '../UnifiedModelSelector';

interface CollapsedHeaderProps {
  platform: string;
  theme: 'light' | 'dark';
  isTyping: boolean;
  messages: Message[];
  quickInput: string;
  setQuickInput: (value: string) => void;
  onSend: (message?: string, fromQuickInput?: boolean) => void;
  onStop: () => void;
  onCollapseToggle: () => void;
  onSizeChange: () => void;
  onHide: () => void;
  onCopyMessage: (content: string) => void;
  onPreviewToggle?: (isExpanded: boolean) => void;
  onMessageEdit?: (messageId: string, newContent: string) => void;
  onMessageFork?: (messageId: string, newContent: string) => void;
  onMessageDelete?: (messageId: string) => void;
  onCopyCode?: (text: string, codeId: string) => void;
  onRecompute?: (messageId: string) => void;
  isResizing: boolean;
  size: string;
  hasNewContext: boolean;
  contextData: { clipboard?: string; selectedText?: string };
  contextToggleEnabled: boolean;
  showContext?: boolean;
  onContextToggle?: () => void;
  uiSettings?: any;
  currentResponse?: string;
  currentModel: string;
  showModelSelector: boolean;
  onModelSelectorToggle: () => void;
  onModelSelect: (model: string) => void;
  voiceModeEnabled?: boolean;
  onVoiceModeToggle?: () => void;
  speechServiceConnected?: boolean;
  isContextExpanded?: boolean;
  onContextExpandedChange?: (expanded: boolean) => void;
  placeholder?: string;
  /** Agent face: orb normally, robot while sensing (and on hover) */
  mood: OrbMood;
  sensing: boolean;
  robotStatus: RobotStatus;
  pulse: RobotPulse | null;
  /** The hover extras row grows the window, so tell the shell when it shows */
  onExtrasChange?: (open: boolean) => void;
}

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
const iconButton = 'grid size-7 shrink-0 place-items-center rounded-[8px] text-foreground/55 transition-colors hover:bg-white/8 hover:text-foreground disabled:opacity-40 [&>svg]:size-3.5';

/**
 * Collapsed Ally: one pill holding the agent's face (the robot whose eyes follow
 * your cursor, or Mary's orb), a quick input, and the rarely used controls tucked
 * into a hover row, like the composer's tool strip.
 */
export default function CollapsedHeader({
  platform,
  theme,
  isTyping,
  messages,
  quickInput,
  setQuickInput,
  onSend,
  onStop,
  onCollapseToggle,
  onSizeChange,
  onHide,
  onCopyMessage,
  onPreviewToggle,
  onMessageEdit,
  onMessageFork,
  onMessageDelete,
  onCopyCode,
  onRecompute,
  isResizing,
  size,
  hasNewContext,
  contextData,
  contextToggleEnabled,
  showContext,
  onContextToggle,
  uiSettings,
  currentResponse,
  currentModel,
  showModelSelector,
  onModelSelectorToggle,
  onModelSelect,
  voiceModeEnabled,
  onVoiceModeToggle,
  isContextExpanded,
  onContextExpandedChange,
  placeholder = 'Balalalala',
  mood,
  sensing,
  robotStatus,
  pulse,
  onExtrasChange,
}: CollapsedHeaderProps) {
  const [extras, setExtras] = useState(false);
  const [hovering, setHovering] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contextExpanded = isContextExpanded ?? false;
  const hasClipboard = hasNewContext && !!(contextData.clipboard || contextData.selectedText);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const showExtras = (open: boolean) => {
    clearTimeout(closeTimer.current);
    if (open) {
      setExtras(true);
      onExtrasChange?.(true);
    } else if (!showModelSelector) {
      // Small grace period so moving between rows doesn't flicker
      closeTimer.current = setTimeout(() => {
        setExtras(false);
        onExtrasChange?.(false);
      }, 350);
    }
  };

  const extraItems = [
    {
      id: 'voice',
      icon: voiceModeEnabled ? <Volume2 /> : <VolumeX />,
      label: 'Voice',
      active: voiceModeEnabled,
      onClick: onVoiceModeToggle,
    },
    { id: 'circle', icon: <Lasso />, label: 'Circle', onClick: () => window.pip?.circle.start() },
    { id: 'clipboard', icon: <Clipboard />, label: 'Clipboard', active: showContext && hasClipboard, dot: hasClipboard, onClick: onContextToggle },
    { id: 'size', icon: <Square />, label: `Size ${size}`, disabled: isResizing, onClick: onSizeChange },
  ];

  return (
    <div className="flex flex-col" onMouseEnter={() => setHovering(true)} onMouseLeave={() => { setHovering(false); showExtras(false); }} onFocusCapture={() => clearTimeout(closeTimer.current)}>
      {/* The pill */}
      <div className="flex items-center gap-1.5 px-1.5 py-1.5">
        <span
          className="grid h-9 w-3 shrink-0 cursor-grab place-items-center text-foreground/25 hover:text-foreground/60"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          title="Drag"
        >
          <GripVertical className="size-3.5" />
        </span>

        <button type="button" onClick={onCollapseToggle} style={noDrag} className="shrink-0 cursor-pointer" title="Open chat">
          <AgentPresence size={36} mood={mood} sensing={sensing} robotStatus={robotStatus} pulse={pulse} forceRobot={hovering && !isTyping} />
        </button>

        <form
          onSubmit={e => {
            e.preventDefault();
            if (isTyping) onStop();
            else onSend(quickInput, true);
          }}
          className="flex min-w-0 flex-1 items-center rounded-[18px] border border-white/10 bg-white/[0.06] pl-3 pr-1 transition-colors focus-within:border-white/30"
          style={noDrag}
        >
          <input
            id="quick-input"
            type="text"
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] font-light outline-none placeholder:text-foreground/35"
          />
          <button
            type="submit"
            disabled={!quickInput.trim() && !isTyping}
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-30',
              isTyping ? 'bg-destructive/25 text-destructive' : 'bg-foreground text-background'
            )}
            title={isTyping ? 'Stop' : 'Send'}
          >
            {isTyping ? <Square className="size-3" /> : <ArrowUp className="size-3.5" />}
          </button>
        </form>

        <div className="flex shrink-0 items-center" style={noDrag}>
          <button
            type="button"
            className={cn(iconButton, 'relative', extras && 'bg-white/8 text-foreground')}
            onMouseEnter={() => showExtras(true)}
            onFocus={() => showExtras(true)}
            onClick={() => showExtras(true)}
            aria-expanded={extras}
            title="More"
          >
            <MoreHorizontal />
            {hasClipboard && <span className="absolute right-1 top-1 size-1 animate-pulse rounded-full bg-foreground" />}
          </button>
          <button type="button" className={iconButton} onClick={onCollapseToggle} disabled={isResizing} title="Expand chat">
            <Maximize2 />
          </button>
          <button type="button" className={cn(iconButton, 'hover:bg-destructive/20')} onClick={onHide} title="Close">
            <X />
          </button>
        </div>
      </div>

      {/* Hover extras: the controls the pill doesn't need all the time */}
      <AnimatePresence initial={false}>
        {extras && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
            style={noDrag}
            onMouseEnter={() => showExtras(true)}
          >
            <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5">
              {extraItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  disabled={item.disabled}
                  className={cn(
                    'relative flex h-7 items-center gap-1.5 rounded-[8px] border border-white/10 px-2 text-[11px] transition-colors disabled:opacity-40 [&>svg]:size-3.5',
                    item.active ? 'bg-white/12 text-foreground' : 'bg-white/[0.03] text-foreground/60 hover:bg-white/8 hover:text-foreground'
                  )}
                >
                  {item.icon}
                  {item.label}
                  {item.dot && <span className="size-1 animate-pulse rounded-full bg-foreground" />}
                </button>
              ))}
              <div className="ml-auto">
                <UnifiedModelSelector
                  platform={platform}
                  theme={theme}
                  currentModel={currentModel}
                  onModelSelect={onModelSelect}
                  showSelector={showModelSelector}
                  onToggleSelector={() => { clearTimeout(closeTimer.current); onModelSelectorToggle(); }}
                  compact
                  windowSize="S"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live reply while the agent works */}
      <div style={noDrag}>
        <CollapsedResponsePreview
          platform={platform}
          theme={theme}
          response={currentResponse || ''}
          isTyping={isTyping}
          onStop={onStop}
          onExpand={onCollapseToggle}
        />
      </div>

      {/* Clipboard context, when shown */}
      {hasClipboard && showContext && (
        <div className="px-2 pb-1.5" style={noDrag}>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => onContextExpandedChange?.(!contextExpanded)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-foreground/70 hover:bg-white/5"
            >
              <Clipboard className="size-3 opacity-60" />
              <span className="flex-1">Clipboard{contextToggleEnabled ? ' · auto-attach' : ''}</span>
              <ChevronDown className={cn('size-3 opacity-60 transition-transform', contextExpanded && 'rotate-180')} />
            </button>
            {contextExpanded && (
              <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap border-t border-white/10 bg-black/20 p-2 font-mono text-[11px] text-foreground/70">
                {contextData.clipboard || contextData.selectedText || ''}
              </pre>
            )}
          </div>
        </div>
      )}

      <div style={noDrag}>
        <CollapsedChatPreview
          platform={platform}
          theme={theme}
          messages={messages}
          isTyping={isTyping}
          currentResponse={currentResponse}
          onCopyMessage={onCopyMessage}
          onPreviewToggle={onPreviewToggle}
          onMessageEdit={onMessageEdit}
          onMessageFork={onMessageFork}
          onMessageDelete={onMessageDelete}
          onCopyCode={onCopyCode}
          onRecompute={onRecompute}
          uiSettings={uiSettings}
        />
      </div>
    </div>
  );
}
