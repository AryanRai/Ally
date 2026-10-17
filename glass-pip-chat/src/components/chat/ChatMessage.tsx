import { useState } from 'react';
import { CopyIcon, GitBranchIcon, PencilIcon, RefreshCcwIcon, Trash2Icon, CheckIcon } from 'lucide-react';
import { Message, MessageAction, MessageActions, MessageContent } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Message as ChatMessageType, Segment } from '@/types/chat';
import type { AgentUsage } from '@/types/agent';
import ToolCall, { describeTool, ImageStrip } from './ToolCall';
import { needsClaudeLogin, openClaudeLogin } from '@/lib/claudeLogin';
import { readableReply, watchUserText } from '@/lib/watchPresentation';
import WatchReplyContent, { OriginalMessage } from './WatchReplyContent';
import { browserActivity } from '../../../electron/agent/browserActivity';

function ToolActivity({ parts }: { parts: Segment[] }) {
  const tools = parts.flatMap(part => part.toolExecution ? [part.toolExecution] : []);
  const failures = tools.filter(tool => tool.status === 'error').length;
  const running = tools.some(tool => tool.status === 'executing' || tool.status === 'pending');
  const browsers = tools.every(tool => browserActivity(tool.name, tool.parameters));
  const context = tools.length ? describeTool(tools[tools.length - 1]).target : undefined;
  return <details className="my-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-foreground/55">
    <summary className="cursor-pointer select-none hover:text-foreground/80">
      {running ? 'Working' : browsers ? 'Used browser' : 'Activity'} · {tools.length} actions
      {failures > 0 && <span className="ml-2 text-destructive">{failures} failed</span>}
      {context && <span className="mt-1 block truncate pl-3.5 text-[11px] text-foreground/40">{context}</span>}
    </summary>
    <div className="mt-2 space-y-1">{tools.map(tool => <ToolCall key={tool.id} tool={tool} />)}</div>
  </details>;
}

function groupToolRuns(parts: Segment[]): Segment[][] {
  const groups: Segment[][] = [];
  for (const part of parts) {
    const previous = groups[groups.length - 1];
    if (part.type === 'tool' && part.toolExecution && previous?.[0].type === 'tool' && previous[0].toolExecution) previous.push(part);
    else groups.push([part]);
  }
  return groups;
}

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
      {groupToolRuns(parts).map((group, i, groups) => {
        const part = group[0];
        return group.length > 1 ? <ToolActivity key={group[0].toolExecution?.id ?? i} parts={group} /> :
        part.type === 'tool' && part.toolExecution ? (
          <ToolCall key={part.toolExecution.id ?? i} tool={part.toolExecution} />
        ) : part.type === 'thinking' ? (
          <Reasoning key={i} isStreaming={streaming && i === groups.length - 1} defaultOpen={false} className="my-0.5">
            <ReasoningTrigger />
            <ReasoningContent>{part.content ?? ''}</ReasoningContent>
          </Reasoning>
        ) : (
          <WatchReplyContent
            key={i}
            streaming={streaming && i === groups.length - 1}
            content={part.content ?? ''}
          />
        )
      })}
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
  const { thinking, text } = isUser ? { thinking: '', text: watchUserText(message.content) } : splitThinking(message.content);

  const copy = async () => {
    const segments = message.metadata?.segments as Segment[] | undefined;
    const visible = isUser ? text : segments?.length ? segments.filter(part => part.type === 'text').map(part => readableReply(part.content ?? '')).join('\n\n') : readableReply(text);
    await navigator.clipboard.writeText(visible);
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
          <div><p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{text}</p>
            {text !== message.content && <OriginalMessage text={message.content} label="Watch instructions" />}
          </div>
        ) : (
          <AgentReply text={text} thinking={thinking} segments={message.metadata?.segments as Segment[] | undefined} />
        )}
      </MessageContent>
      {!isUser && needsClaudeLogin(message.content) && (
        <Button size="sm" variant="outline" className="w-fit" onClick={openClaudeLogin}>Sign in to Claude Code</Button>
      )}
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
