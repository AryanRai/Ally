import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Message } from '@/types/chat';
import WatchReplyContent from './WatchReplyContent';
import CompactUserMessage from './CompactUserMessage';

interface CollapsedChatPreviewProps {
  messages: Message[];
  onPreviewToggle?: (expanded: boolean) => void;
}

/** History is opt-in; the current turn has a single live reader above it. */
export default function CollapsedChatPreview({ messages, onPreviewToggle }: CollapsedChatPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  if (!messages.length) return null;
  return <div className="border-t border-white/10" style={{ userSelect: 'text' }}>
    <button type="button" aria-expanded={expanded} onClick={() => {
      setExpanded(value => !value);
      onPreviewToggle?.(!expanded);
    }} className="flex w-full items-center justify-between px-2 py-2 text-[11px] text-foreground/50 hover:text-foreground/80">
      <span>Recent messages · {messages.length}</span>
      {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
    </button>
    {expanded && <div role="region" aria-label="Recent messages" tabIndex={0} className="max-h-48 space-y-3 overflow-y-auto overscroll-contain break-words px-3 pb-3 [overflow-wrap:anywhere]">
      {messages.slice(-10).map(message => <div key={message.id}>
        {message.role === 'assistant' ? <><p className="mb-1 text-[10px] font-medium text-foreground/45">Ally</p><WatchReplyContent content={message.content} /></> : <CompactUserMessage content={message.content} />}
      </div>)}
    </div>}
  </div>;
}
