import { useState } from 'react';
import { CopyIcon, GitBranchIcon, PencilIcon, RefreshCcwIcon, Trash2Icon, CheckIcon } from 'lucide-react';
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Message as ChatMessageType, Segment } from '@/types/chat';
import type { AgentUsage } from '@/types/agent';
import ToolCall, { ImageStrip } from './ToolCall';

const THINK_BLOCK = /<think>([\s\S]*?)<\/think>\s*/i;

/** Split a saved reply into its thinking block and visible text. */
function splitThinking(content: string): { thinking: string; text: string } {
  const match = content.match(THINK_BLOCK);
  return match ? { thinking: match[1].trim(), text: content.replace(THINK_BLOCK, '').trim() } : { thinking: '', text: content };
}

interface AgentReplyProps {
  text: string;
  thinking?: string;
  segments?: Segment[];
  streaming?: boolean;
}

/** An agent reply: thinking, then text interleaved with tool calls. Used live and for history. */
export function AgentReply({ text, thinking, segments, streaming = false }: AgentReplyProps) {
  const parts: Segment[] = segments?.length ? segments : text ? [{ type: 'text', content: text }] : [];
  // Newer replies keep reasoning inline between tool calls; older ones have one block up top
  const inlineThinking = parts.some(p => p.type === 'thinking');
  return (
    <>
      {thinking && !inlineThinking && (
        <Reasoning isStreaming={streaming && parts.length === 0} defaultOpen={false} className="mb-1">
          <ReasoningTrigger />
          <ReasoningContent>{thinking}</ReasoningContent>
        </Reasoning>
      )}
      {parts.map((part, i) =>
        part.type === 'tool' && part.toolExecution ? (
          <ToolCall key={part.toolExecution.id ?? i} tool={part.toolExecution} />
        ) : part.type === 'thinking' ? (
          <Reasoning key={i} isStreaming={streaming && i === parts.length - 1} defaultOpen={false} className="my-0.5">
            <ReasoningTrigger />
            <ReasoningContent>{part.content ?? ''}</ReasoningContent>
          </Reasoning>
        ) : (
          <MessageResponse
            key={i}
            isAnimating={streaming && i === parts.length - 1}
            // prxptn body copy: light, 13px, airy, slightly dimmed white
            className="text-[13px] font-light leading-[1.75] text-foreground/85"
          >
            {part.content ?? ''}
          </MessageResponse>
        )
      )}
      {streaming && parts.length === 0 && !thinking && (
        <Shimmer className="font-mono text-xs" duration={1.2}>Working…</Shimmer>
      )}
    </>
  );
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

/** "12k in · 820 out · $0.03 · 14s", what the CLIs report at the end of a turn. */
function UsageLine({ usage }: { usage: AgentUsage }) {
  const parts = [
    usage.inputTokens != null && `${compact(usage.inputTokens)} in`,
    usage.outputTokens != null && `${compact(usage.outputTokens)} out`,
    usage.costUsd != null && `$${usage.costUsd.toFixed(usage.costUsd < 0.1 ? 3 : 2)}`,
    usage.durationMs != null && `${Math.round(usage.durationMs / 1000)}s`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <p className="px-label select-none text-foreground/30">{parts.join(' · ')}</p>;
}

interface ChatMessageProps {
  message: ChatMessageType;
  onEdit: (id: string, content: string) => void;
  onFork: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

/** A saved chat message with hover actions (copy, retry, edit/fork, delete). */
export default function ChatMessage({ message, onEdit, onFork, onDelete, onRetry }: ChatMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const { thinking, text } = isUser ? { thinking: '', text: message.content } : splitThinking(message.content);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (editing) {
    return (
      <Message from={message.role}>
        <div className="flex w-full flex-col gap-2">
          <Textarea value={draft} onChange={e => setDraft(e.target.value)} className="min-h-20 font-light" autoFocus />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => { onEdit(message.id, draft); setEditing(false); }}>Save</Button>
            {isUser && (
              <Button size="sm" variant="outline" onClick={() => { onFork(message.id, draft); setEditing(false); }}>
                <GitBranchIcon className="size-3.5" /> Fork chat
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setDraft(message.content); setEditing(false); }}>Cancel</Button>
          </div>
        </div>
      </Message>
    );
  }

  return (
    <Message from={message.role}>
      {message.metadata?.image && (
        <img
          src={message.metadata.image}
          alt="Circled region"
          className="ml-auto max-h-40 border border-border shadow-[0_0_18px_rgba(255,255,255,0.08)]"
        />
      )}
      <MessageContent>
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{text}</p>
        ) : (
          <AgentReply text={text} thinking={thinking} segments={message.metadata?.segments as Segment[] | undefined} />
        )}
      </MessageContent>
      {!!message.metadata?.images?.length && <ImageStrip images={message.metadata.images} className="ml-auto" />}
      {message.metadata?.usage && <UsageLine usage={message.metadata.usage} />}
      {message.metadata?.context && (
        <p className="px-label ml-auto max-w-full truncate" title={message.metadata.context}>
          + clipboard · {message.metadata.context.slice(0, 60)}
        </p>
      )}
      <MessageActions className={`opacity-0 transition-opacity group-hover:opacity-100 ${isUser ? 'ml-auto' : ''}`}>
        <MessageAction tooltip={copied ? 'Copied' : 'Copy'} onClick={copy}>
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </MessageAction>
        {isUser ? (
          <MessageAction tooltip="Edit" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3.5" />
          </MessageAction>
        ) : (
          <MessageAction tooltip="Retry" onClick={() => onRetry(message.id)}>
            <RefreshCcwIcon className="size-3.5" />
          </MessageAction>
        )}
        <MessageAction tooltip="Delete" onClick={() => onDelete(message.id)}>
          <Trash2Icon className="size-3.5" />
        </MessageAction>
      </MessageActions>
    </Message>
  );
}
