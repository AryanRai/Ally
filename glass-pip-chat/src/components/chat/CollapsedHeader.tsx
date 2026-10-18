import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ChevronDown, Clipboard, GripVertical, Lasso, Maximize2, MoreHorizontal, Play, Square, Volume2, VolumeX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message, Segment } from '@/types/chat';
import AgentPresence from '@/components/glow/AgentPresence';
import type { OrbMood } from '@/components/glow/EnergyOrb';
import type { RobotPulse, RobotStatus } from '@/components/glow/RobotAvatar';
import PillAgentMonitor from './PillAgentMonitor';
import type { AssistantActivityRow } from '../../../electron/watch/assistantActivity';
import CollapsedChatPreview from './CollapsedChatPreview';
import CollapsedResponsePreview from './CollapsedResponsePreview';
import { UnifiedModelSelector } from '../UnifiedModelSelector';
import CompactUserMessage from './CompactUserMessage';
import type { ChatInteractionCardProps } from './ChatInteractionCard';

interface CollapsedHeaderProps {
  onOpenAgent?: (row: AssistantActivityRow) => Promise<void>;
  decisionControls?: React.ReactNode;
  decisions?: ChatInteractionCardProps['request'][];
  onAnswerDecision?: ChatInteractionCardProps['onAnswer'];
  meetingControls?: React.ReactNode;
  menuControls?: React.ReactNode;
  drawingControls?: React.ReactNode;
  heightConstrained?: boolean;
  screenAutoAttach?: boolean;
  onScreenAutoAttachToggle?: () => void;
  onClipboardAutoAttachToggle?: () => void;
  chatTitle?: string;
  workingStatus?: string;
  stopDisabledReason?: string;
  sendFailure?: string;
  onHeightChange?: (height: number) => void;
  platform: string;
  theme: 'light' | 'dark';
  isTyping: boolean;
  messages: Message[];
  quickInput: string;
  setQuickInput: (value: string) => void;
  onSend: (message?: string, fromQuickInput?: boolean, mode?: 'steer' | 'queue') => void;
  onStop: () => void;
  onResume?: () => void;
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
  responseSegments?: Segment[];
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
  /** Extra controls grow the window. */
  onExtrasChange?: (open: boolean) => void;
}

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;
const iconButton = 'grid size-7 shrink-0 place-items-center rounded-[8px] text-foreground/55 transition-colors hover:bg-white/8 hover:text-foreground disabled:opacity-40 [&>svg]:size-3.5';

/**
 * Collapsed Ally: one pill holding the agent's face (the robot whose eyes follow
 * your cursor, or Mary's orb), a quick input, and the rarely used controls tucked
 * into a toggled row, like the composer's tool strip.
 */
export default function CollapsedHeader({
  onOpenAgent,
  decisionControls,
  decisions,
  onAnswerDecision,
  meetingControls,
  menuControls,
  drawingControls,
  heightConstrained,
  screenAutoAttach,
  onScreenAutoAttachToggle,
  onClipboardAutoAttachToggle,
  chatTitle,
  workingStatus,
  stopDisabledReason,
  sendFailure,
  onHeightChange,
  platform,
  theme,
  isTyping,
  messages,
  quickInput,
  setQuickInput,
  onSend,
  onStop,
  onResume,
  onCollapseToggle,
  onSizeChange,
  onHide,
  onCopyMessage,
  onPreviewToggle,
  isResizing,
  size,
  hasNewContext,
  contextData,
  contextToggleEnabled,
  showContext,
  onContextToggle,
  currentResponse,
  responseSegments,
  currentModel,
  showModelSelector,
  onModelSelectorToggle,
  onModelSelect,
  voiceModeEnabled,
  onVoiceModeToggle,
  isContextExpanded,
  onContextExpandedChange,
  placeholder = 'Ask Ally…',
  mood,
  sensing,
  robotStatus,
  pulse,
  onExtrasChange,
}: CollapsedHeaderProps) {
  const [extras, setExtras] = useState(false);
  const [hovering, setHovering] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastMessage = messages.at(-1);
  const latestReply = lastMessage?.role === 'assistant' ? lastMessage : undefined;
  const latestUser = [...messages].reverse().find(message => message.role === 'user');
  const contextExpanded = isContextExpanded ?? false;
  const hasClipboard = hasNewContext && !!(contextData.clipboard || contextData.selectedText);
  const olderReplies = useMemo(() => messages.filter(message => message.role === 'assistant' && message.id !== latestReply?.id), [messages, latestReply?.id]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onHeightChange) return;
    const measure = () => onHeightChange(Math.ceil(root.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [onHeightChange]);

  const showExtras = (open: boolean) => {
    setExtras(open);
    onExtrasChange?.(open);
    if (!open && showModelSelector) onModelSelectorToggle();
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
    <div ref={rootRef} className={cn('flex shrink-0 flex-col overflow-y-auto [&>*]:shrink-0', heightConstrained ? 'max-h-full' : 'max-h-[740px]')} onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} onKeyDown={event => {
      if (event.key === 'Escape' && extras && !showModelSelector) {
        event.stopPropagation();
        showExtras(false);
        document.getElementById('quick-input')?.focus();
      }
    }}>
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
            if (quickInput.trim()) onSend(quickInput, true, 'queue');
          }}
          className="flex min-w-0 flex-1 items-center rounded-[18px] border border-white/10 bg-white/[0.06] pl-3 pr-1 transition-colors focus-within:border-white/30"
          style={noDrag}
        >
          <input
            aria-label="Message Ally"
            id="quick-input"
            type="text"
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            onKeyDown={event => {
              if (isTyping && event.key === 'Enter' && event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (quickInput.trim()) onSend(quickInput, true, 'steer');
              }
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] font-light outline-none placeholder:text-foreground/35"
          />
          {isTyping && <button type="button" disabled={!quickInput.trim()} onClick={() => onSend(quickInput, true, 'steer')} title="Shift+Enter · steer current work" className="px-1 text-[10px] disabled:opacity-30">Steer now</button>}
          {isTyping && !stopDisabledReason && <button type="button" onClick={onStop} className={iconButton} title="Stop response" aria-label="Stop response"><Square className="size-3" /></button>}
          {!isTyping && onResume && <button type="button" onClick={onResume} className={iconButton} title="Resume response" aria-label="Resume response"><Play className="size-3" /></button>}
          <button
            type="submit"
            disabled={!quickInput.trim()}
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-30',
              'bg-foreground text-background'
            )}
            aria-label={isTyping ? 'Queue message' : 'Send'}
            title={isTyping ? 'Queue message' : 'Send'}
          >
            <ArrowUp className="size-3.5" />
          </button>
        </form>

        <div className="flex shrink-0 items-center" style={noDrag}>
          <button
            type="button"
            className={cn(iconButton, 'relative', extras && 'bg-white/8 text-foreground')}
            onClick={() => showExtras(!extras)}
            aria-label="More controls"
            aria-expanded={extras}
            title="More"
          >
            <MoreHorizontal />
            {hasClipboard && <span className="absolute right-1 top-1 size-1 animate-pulse rounded-full bg-foreground" />}
          </button>
          <button type="button" className={iconButton} onClick={onCollapseToggle} disabled={isResizing} title="Expand chat">
            <Maximize2 />
          </button>
          <button type="button" className={cn(iconButton, 'hover:bg-destructive/20')} onClick={onHide} title="Hide Ally">
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
                  onToggleSelector={onModelSelectorToggle}
                  compact
                  windowSize="S"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keep setup state mounted while the overflow menu is closed. */}
      {menuControls && <div hidden={!extras} style={{ ...noDrag, display: extras ? undefined : 'none' }}>{menuControls}</div>}
      {extras && <div style={noDrag}><CollapsedChatPreview messages={messages.filter(message => message.id !== latestUser?.id && message.id !== latestReply?.id)} decisions={decisions} onAnswer={onAnswerDecision} onPreviewToggle={onPreviewToggle} /></div>}

      {/* Current turn stays below the pill, including after completion. */}
      <div className="space-y-1.5 px-2 pb-1.5" style={noDrag}>
        {chatTitle && <button type="button" onClick={onCollapseToggle} title={chatTitle} className="block w-full truncate text-left text-[10px] text-foreground/45 hover:text-foreground/75">{chatTitle}</button>}
        {latestUser && <CompactUserMessage key={latestUser.id} content={latestUser.content} images={latestUser.metadata?.images ?? (latestUser.metadata?.image ? [latestUser.metadata.image] : undefined)} />}
        <CollapsedResponsePreview
          response={currentResponse || ((!isTyping || stopDisabledReason) ? latestReply?.content : '') || ''}
          segments={currentResponse ? responseSegments : ((!isTyping || stopDisabledReason) ? latestReply?.metadata?.segments : undefined)}
          images={!currentResponse && (!isTyping || stopDisabledReason) ? latestReply?.metadata?.images : undefined}
          responseId={latestUser?.id}
          isTyping={isTyping}
          workingStatus={workingStatus}
          onCopy={onCopyMessage}
          olderReplies={olderReplies}
        />
        {isTyping && stopDisabledReason && <p className="text-[10px] text-foreground/45">{stopDisabledReason}</p>}
        {sendFailure && <p role="alert" className="text-xs text-amber-200">{sendFailure}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1 px-2 pb-1" style={noDrag}>
        {drawingControls}
        <button type="button" aria-pressed={!!screenAutoAttach} title="Attach a fresh screen to each question · no continuous recording" onClick={onScreenAutoAttachToggle} className="h-6 rounded-md px-1.5 text-[10px] text-foreground/55 hover:bg-white/5">Screen{screenAutoAttach ? ' · auto' : ''}</button>
        <button type="button" aria-pressed={contextToggleEnabled} onClick={onClipboardAutoAttachToggle} title="Toggle clipboard auto-attach" className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] text-foreground/55 hover:bg-white/5"><Clipboard className="size-3" />Clipboard{contextToggleEnabled ? ' · auto' : ''}</button>
        {hasClipboard && showContext && <button type="button" aria-label="Preview clipboard" aria-expanded={contextExpanded} onClick={() => onContextExpandedChange?.(!contextExpanded)} className="h-6 px-1 text-foreground/45"><ChevronDown className="size-3" /></button>}
        <PillAgentMonitor compact onOpen={onOpenAgent} />
      </div>

      {meetingControls && <div style={noDrag}>{meetingControls}</div>}

      {/* Clipboard context, when shown */}
      {hasClipboard && showContext && contextExpanded && (
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

      {decisionControls && <div className="px-2 pb-2 select-text" style={noDrag}>{decisionControls}</div>}
    </div>
  );
}
