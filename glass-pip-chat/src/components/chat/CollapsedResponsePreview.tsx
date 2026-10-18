import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, ArrowDown } from 'lucide-react';
import WatchReplyContent from './WatchReplyContent';
import { readableReply } from '@/lib/watchPresentation';
import { collapsedReply } from '@/lib/collapsedReply';
import { displayAssistantText } from '@/lib/messageDisplay';
import type { Message, Segment } from '@/types/chat';
import { AgentReply } from './ChatMessage';
import { ImageStrip } from './ToolCall';

interface CollapsedResponsePreviewProps {
  response: string;
  segments?: Segment[];
  images?: string[];
  responseId?: string;
  isTyping: boolean;
  workingStatus?: string;
  onCopy?: (text: string) => void;
  olderReplies?: Message[];
}

/** A bounded live reader beneath the pill. Scrolling up pauses following. */
export default function CollapsedResponsePreview({ response: latestResponse, segments: latestSegments, images: latestImages, responseId, isTyping: liveTyping, workingStatus, onCopy, olderReplies = [] }: CollapsedResponsePreviewProps) {
  const [historyId, setHistoryId] = useState<string | null>(null);
  const index = olderReplies.findIndex(message => message.id === historyId);
  const historical = index >= 0 ? olderReplies[index] : undefined;
  const response = historical?.content ?? latestResponse, segments = historical?.metadata?.segments ?? (historical ? undefined : latestSegments), images = historical?.metadata?.images ?? (historical ? undefined : latestImages);
  const isTyping = liveTyping && !historical;
  const overscroll = useRef(0), lastNavigation = useRef(0), touchY = useRef<number | undefined>(undefined);
  const navigate = (direction: -1 | 1) => {
    const next = historical ? index + direction : direction < 0 ? olderReplies.length - 1 : olderReplies.length;
    if (next < 0 || (!historical && direction > 0)) return;
    setHistoryId(next >= olderReplies.length ? null : olderReplies[next].id);
    overscroll.current = 0; lastNavigation.current = Date.now();
    following.current = false; setPaused(true);
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = direction < 0 ? scrollRef.current.scrollHeight : 0; });
  };
  const browse = (delta: number, panel: HTMLDivElement) => {
    const edge = delta < 0 ? panel.scrollTop <= 1 : panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
    if (!edge || Date.now() - lastNavigation.current < 650) { overscroll.current = 0; return; }
    if (Math.sign(overscroll.current) !== Math.sign(delta)) overscroll.current = 0;
    overscroll.current += delta;
    if (Math.abs(overscroll.current) >= 120) navigate(delta < 0 ? -1 : 1);
  };
  const reply = useMemo(() => collapsedReply(response, segments), [response, segments]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const draggingScrollbar = useRef(false);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const wasWorking = useRef(false);

  useEffect(() => {
    if (liveTyping && !wasWorking.current) {
      setExpanded(true);
      following.current = true;
      setPaused(false);
    }
    wasWorking.current = liveTyping;
  }, [liveTyping]);

  useEffect(() => {
    setHistoryId(null); overscroll.current = 0;
    setExpanded(true);
    following.current = true;
    setPaused(false);
  }, [responseId]);

  useEffect(() => {
    if (following.current && expanded && scrollRef.current) {
      scrollRef.current.scrollTop = isTyping ? scrollRef.current.scrollHeight : 0;
    }
  }, [response, expanded, isTyping]);

  // Rich markdown and widgets can grow after the text chunk renders.
  useEffect(() => {
    const panel = scrollRef.current;
    const content = panel?.firstElementChild;
    if (!panel || !content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (following.current && isTyping) panel.scrollTop = panel.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [expanded, !!response, isTyping]);

  const pauseFollowing = () => { following.current = false; setPaused(true); };
  if (!response && !segments?.length && !images?.length && !isTyping) return null;
  const status = historical ? `Earlier reply · ${index + 1} / ${olderReplies.length}` : isTyping ? workingStatus || (reply.text ? 'Writing…' : 'Thinking…') : reply.interrupted ? 'Earlier reply' : reply.commentaryOnly ? 'Latest update' : 'Latest reply';
  return <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]" aria-label="Current reply" style={{ userSelect: 'text' }}>
    <div className="flex min-w-0 select-none items-center gap-1 px-2 py-1">
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-label={expanded ? 'Collapse reply' : 'Show reply'} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-[11px] text-foreground/65">
        <span className={`size-1.5 shrink-0 rounded-full ${isTyping ? 'animate-pulse bg-emerald-400' : 'bg-foreground/30'}`} />
        <span role={isTyping ? 'status' : undefined} className="truncate">{status}</span>
        {expanded ? <ChevronUp aria-hidden="true" focusable="false" className="ml-auto size-3 shrink-0" /> : <ChevronDown aria-hidden="true" focusable="false" className="ml-auto size-3 shrink-0" />}
      </button>
      {!!olderReplies.length && <><button type="button" aria-label="Older reply" disabled={historical && index === 0} title="Scroll past the top for older replies" className="grid size-6 shrink-0 place-items-center rounded-md text-foreground/50 hover:bg-white/10 disabled:opacity-25" onClick={() => navigate(-1)}><ChevronUp className="size-3" /></button><button type="button" aria-label="Newer reply" disabled={!historical} className="grid size-6 shrink-0 place-items-center rounded-md text-foreground/50 hover:bg-white/10 disabled:opacity-25" onClick={() => navigate(1)}><ChevronDown className="size-3" /></button></>}
      {historical && liveTyping && <span role="status" className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" title={workingStatus || 'Working…'} aria-label={workingStatus || 'Working…'} />}
      {reply.text && onCopy && <button type="button" onClick={() => onCopy(displayAssistantText(readableReply(reply.text)))} aria-label="Copy reply" title="Copy reply" className="grid size-7 shrink-0 place-items-center rounded-md text-foreground/55 hover:bg-white/10"><Copy aria-hidden="true" focusable="false" className="size-3" /></button>}
    </div>
    {expanded && reply.text && <div data-ally-reply-reader ref={scrollRef} role="region" aria-label={isTyping || reply.commentaryOnly ? "Live update" : "Latest reply"} tabIndex={0}
      onWheel={event => { if (event.deltaY < 0) pauseFollowing(); browse(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1), event.currentTarget); }}
      onTouchStart={event => { touchY.current = event.touches[0]?.clientY; }}
      onTouchMove={event => { pauseFollowing(); const next = event.touches[0]?.clientY; if (next !== undefined && touchY.current !== undefined) browse(touchY.current - next, event.currentTarget); touchY.current = next; }}
      onPointerDown={event => { draggingScrollbar.current = event.target === event.currentTarget; }}
      onPointerUp={() => { draggingScrollbar.current = false; }}
      onPointerCancel={() => { draggingScrollbar.current = false; }}
      onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); navigate(event.key === 'ArrowUp' ? -1 : 1); } else if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) pauseFollowing(); }}
      onScroll={event => {
        // Layout and browser scroll anchoring also emit scroll. Only the reader
        // can pause following; arriving text must never pause itself.
        if (following.current && !draggingScrollbar.current) return;
        const panel = event.currentTarget;
        following.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 24;
        setPaused(!following.current);
      }}
      className="max-h-48 overflow-y-auto overscroll-contain break-words px-3 pb-3 text-[13px] [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto">
      <WatchReplyContent content={reply.text} streaming={isTyping} compact />
    </div>}
    {expanded && !!images?.length && <ImageStrip images={images} className="px-3 pb-2" />}
    {!!reply.activity.length && <details className="border-t border-white/10 px-3 py-2 text-[11px] text-foreground/55">
      <summary className="cursor-pointer select-none">Progress and activity · {reply.activity.length}</summary>
      <div className="mt-2 max-h-48 space-y-2 overflow-y-auto overscroll-contain"><AgentReply text="" segments={reply.activity} compact /></div>
    </details>}
    {expanded && reply.interrupted && !isTyping && <p className="px-3 pb-2 text-[10px] text-foreground/45">This earlier reply was interrupted.</p>}
    {expanded && paused && <button type="button" className="flex w-full items-center justify-center gap-1 border-t border-white/10 py-1.5 text-[11px] text-foreground/75 hover:bg-white/5" onClick={() => {
      setHistoryId(null);
      following.current = true;
      draggingScrollbar.current = false;
      setPaused(false);
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }}><ArrowDown aria-hidden="true" focusable="false" className="size-3" />Follow latest</button>}
  </section>;
}
