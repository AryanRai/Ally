import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Message } from '@/types/chat';
import CollapsedResponsePreview from './CollapsedResponsePreview';
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
      {expanded ? <ChevronUp aria-hidden="true" focusable="false" className="size-3" /> : <ChevronDown aria-hidden="true" focusable="false" className="size-3" />}
    </button>
    {expanded && <div role="region" aria-label="Recent messages" tabIndex={0} className="max-h-48 space-y-3 overflow-y-auto overscroll-contain break-words px-3 pb-3 [overflow-wrap:anywhere]">
      {messages.slice(-10).map(message => <div key={message.id}>
        {message.role === 'assistant' ? <><p className="mb-1 text-[10px] font-medium text-foreground/45">Ally</p><CollapsedResponsePreview response={message.content} segments={message.metadata?.segments} images={message.metadata?.images} isTyping={false} /></> : <CompactUserMessage content={message.content} images={message.metadata?.images ?? (message.metadata?.image ? [message.metadata.image] : undefined)} />}
      </div>)}
    </div>}
  </div>;
}
