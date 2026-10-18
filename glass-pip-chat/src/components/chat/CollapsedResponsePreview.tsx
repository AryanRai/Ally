import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, ArrowDown } from 'lucide-react';
import WatchReplyContent from './WatchReplyContent';
import { readableReply } from '@/lib/watchPresentation';
import { compactReply } from '@/lib/compactPresentation';

interface CollapsedResponsePreviewProps {
  response: string;
  responseId?: string;
  isTyping: boolean;
  workingStatus?: string;
  onCopy?: (text: string) => void;
}

/** A bounded live reader beneath the pill. Scrolling up pauses following. */
export default function CollapsedResponsePreview({ response, responseId, isTyping, workingStatus, onCopy }: CollapsedResponsePreviewProps) {
  const reply = compactReply(response);
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const draggingScrollbar = useRef(false);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const wasWorking = useRef(false);

  useEffect(() => {
    if (isTyping && !wasWorking.current) {
      setExpanded(true);
      following.current = true;
      setPaused(false);
    }
    wasWorking.current = isTyping;
  }, [isTyping]);

  useEffect(() => {
    setExpanded(true);
    following.current = true;
    setPaused(false);
  }, [responseId]);

  useEffect(() => {
    if (following.current && expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [response, expanded]);

  // Rich markdown and widgets can grow after the text chunk renders.
  useEffect(() => {
    const panel = scrollRef.current;
    const content = panel?.firstElementChild;
    if (!panel || !content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (following.current) panel.scrollTop = panel.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [expanded, !!response]);

  const pauseFollowing = () => { following.current = false; setPaused(true); };
  if (!response && !isTyping) return null;
  const status = isTyping ? workingStatus || (reply.text ? 'Writing…' : 'Thinking…') : reply.interrupted ? 'Earlier reply' : 'Latest reply';
  return <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]" aria-label="Current reply" style={{ userSelect: 'text' }}>
    <div className="flex min-w-0 items-center gap-1 px-2 py-1">
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-label={expanded ? 'Collapse reply' : 'Show reply'} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-[11px] text-foreground/65">
        <span className={`size-1.5 shrink-0 rounded-full ${isTyping ? 'animate-pulse bg-emerald-400' : 'bg-foreground/30'}`} />
        <span role={isTyping ? 'status' : undefined} className="truncate">{status}</span>
        {expanded ? <ChevronUp className="ml-auto size-3 shrink-0" /> : <ChevronDown className="ml-auto size-3 shrink-0" />}
      </button>
      {reply.text && onCopy && <button type="button" onClick={() => onCopy(readableReply(reply.text))} aria-label="Copy reply" title="Copy reply" className="grid size-7 shrink-0 place-items-center rounded-md text-foreground/55 hover:bg-white/10"><Copy className="size-3" /></button>}
    </div>
    {expanded && reply.text && <div data-ally-reply-reader ref={scrollRef} role="region" aria-label="Live reply" tabIndex={0}
      onWheel={event => { if (event.deltaY < 0) pauseFollowing(); }}
      onTouchMove={pauseFollowing}
      onPointerDown={event => { draggingScrollbar.current = event.target === event.currentTarget; }}
      onPointerUp={() => { draggingScrollbar.current = false; }}
      onPointerCancel={() => { draggingScrollbar.current = false; }}
      onKeyDown={event => { if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) pauseFollowing(); }}
      onScroll={event => {
        // Layout and browser scroll anchoring also emit scroll. Only the reader
        // can pause following; arriving text must never pause itself.
        if (following.current && !draggingScrollbar.current) return;
        const panel = event.currentTarget;
        following.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 24;
        setPaused(!following.current);
      }}
      className="max-h-48 overflow-y-auto overscroll-contain break-words px-3 pb-3 text-[13px] [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto">
      <WatchReplyContent content={reply.text} streaming={isTyping} />
    </div>}
    {expanded && reply.interrupted && !isTyping && <p className="px-3 pb-2 text-[10px] text-foreground/45">This earlier reply was interrupted.</p>}
    {expanded && paused && <button type="button" className="flex w-full items-center justify-center gap-1 border-t border-white/10 py-1.5 text-[11px] text-foreground/75 hover:bg-white/5" onClick={() => {
      following.current = true;
      draggingScrollbar.current = false;
      setPaused(false);
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }}><ArrowDown className="size-3" />Follow latest</button>}
  </section>;
}
