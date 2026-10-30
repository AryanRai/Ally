import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { displayAssistantText, displayUserText } from '@/lib/messageDisplay';
import { historyReply } from '@/lib/historyReply';
import { studyReplyView } from '@/lib/studyPresentation';
import ChatInteractionCard from './ChatInteractionCard';
import type { InteractionHistory } from '../../../electron/devices/interactions';
import type { ApprovalAnswer } from '../../../electron/watch/approvals';
import { requestAnchor } from '@/lib/activityRequests';
type ReplyPart = Segment | { type: 'interaction'; request: InteractionHistory };

function ToolActivity({ parts }: { parts: Segment[] }) {
  const tools = parts.flatMap(part => part.toolExecution ? [part.toolExecution] : []);
  const failures = tools.filter(tool => tool.status === 'error').length;
  const running = tools.some(tool => tool.status === 'executing' || tool.status === 'pending');
  const context = tools.length ? describeTool(tools[tools.length - 1]).target : undefined;
  return <>
    <details className="my-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-foreground/55">
      <summary className="cursor-pointer select-none hover:text-foreground/80">
        {running ? 'Working…' : 'Thinking'} · {tools.length} steps
        {failures > 0 && <span className="ml-2 text-destructive">{failures} failed</span>}
        {context && <span className="mt-1 block truncate pl-3.5 text-[11px] text-foreground/40">{context}</span>}
      </summary>
      <div className="mt-2 space-y-1">{tools.map(tool => <ToolCall key={tool.id} tool={tool} />)}</div>
    </details>
  </>;
}

function groupToolRuns(parts: ReplyPart[]): ReplyPart[][] {
  const groups: ReplyPart[][] = [];
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
  compact?: boolean;
  durationMs?: number;
  requests?: InteractionHistory[];
  onAnswerRequest?: (id: string, answer: ApprovalAnswer) => Promise<unknown>;
}

/** An agent reply: thinking, then text interleaved with tool calls. Used live and for history. */
export const AgentReply = memo(function AgentReply({ text, thinking, segments, streaming = false, compact = false, durationMs, requests = [], onAnswerRequest }: AgentReplyProps) {
  const original: Segment[] = segments?.length ? segments : text ? [{ type: 'text', content: text, phase: 'final_answer' }] : [];
  const steps = original.flatMap(part => part.toolExecution ? [{ id: part.toolExecution.id, startedAt: part.toolExecution.startTime, endedAt: part.toolExecution.endTime }] : []);
  const anchors = requests.map(request => ({ request, anchor: requestAnchor(request.createdAt, steps) }));
  const unanchored: ReplyPart[] = anchors.filter(row => !row.anchor).map(row => ({ type: 'interaction', request: row.request }));
  const parts: ReplyPart[] = original.flatMap((part): ReplyPart[] => [...(part.phase === 'final_answer' ? unanchored.splice(0) : []), part, ...anchors.filter(row => row.anchor && row.anchor === part.toolExecution?.id).map(row => ({ type: 'interaction' as const, request: row.request }))]);
  parts.push(...unanchored);
  // Newer replies keep reasoning inline between tool calls; older ones have one block up top
  const inlineThinking = parts.some(p => p.type === 'thinking');
  const finalIndex = parts.findIndex(part => part.type === 'text' && part.phase === 'final_answer');
  const canSummarize = !streaming && finalIndex > 0 && !requests.some(row => row.state === 'pending');
  const activity = canSummarize ? parts.slice(0, finalIndex) : parts;
  const renderParts = (entries: ReplyPart[]) => groupToolRuns(entries).map((group, i, groups) => {
    const part = group[0];
    if (part.type === 'interaction') return <ChatInteractionCard key={part.request.id} request={part.request} onAnswer={onAnswerRequest ?? (async () => { throw Error('Open the originating chat to answer.'); })} />;
    if (part.type === 'tool' && part.toolExecution) return <ToolActivity key={part.toolExecution.id ?? i} parts={group as Segment[]} />;
    if (part.type === 'thinking') return <Reasoning key={i} isStreaming={streaming && i === groups.length - 1} defaultOpen={false} className="my-0.5">
      <ReasoningTrigger /><ReasoningContent>{part.content ?? ''}</ReasoningContent>
    </Reasoning>;
    return <WatchReplyContent key={part.itemId ?? i} compact={compact} streaming={streaming && i === groups.length - 1} content={part.content ?? ''} />;
  });
  const tools = activity.filter(part => part.type === 'tool').length;
  const updates = activity.filter(part => part.type === 'text').length;
  const elapsed = durationMs != null && durationMs > 0 ? ` · ${Math.max(1, Math.round(durationMs / 1000))}s` : '';
  return <>
    {thinking && !inlineThinking && <Reasoning isStreaming={streaming && parts.length === 0} defaultOpen={false} className="mb-1">
      <ReasoningTrigger /><ReasoningContent>{thinking}</ReasoningContent>
    </Reasoning>}
    {canSummarize ? <>
      <details className="my-2 text-xs text-foreground/55" key="completed-activity">
        <summary className="cursor-pointer select-none py-2">Activity · {tools} steps · {updates} updates{elapsed}</summary>
        <div className="mt-2 space-y-2">{renderParts(activity)}</div>
      </details>
      {renderParts(parts.slice(finalIndex))}
    </> : renderParts(parts)}
    {streaming && parts.length === 0 && !thinking && <Shimmer className="font-mono text-xs" duration={1.2}>Working…</Shimmer>}
  </>;
});

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
  /** Positive live evidence for this exact reply, supplied by the selected chat. */
  sessionWorking?: boolean;
  onAnswerRequest?: (id: string, answer: ApprovalAnswer) => Promise<unknown>;
  onEdit: (id: string, content: string) => void;
  onFork: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

/** A saved chat message with hover actions (copy, retry, edit/fork, delete). */
export default function ChatMessage(props: ChatMessageProps) {
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  // Parent handlers change while typing/streaming. Keep event dispatch current
  // without making every unchanged tool/reasoning subtree reconcile again.
  const actions = useMemo(() => ({
    onEdit: (id: string, content: string) => latest.current.onEdit(id, content),
    onFork: (id: string, content: string) => latest.current.onFork(id, content),
    onDelete: (id: string) => latest.current.onDelete(id),
    onRetry: (id: string) => latest.current.onRetry(id),
  }), []);
  const { message } = props;
  // ChatManager edits content/timestamp in place. Snapshot its fields so the
  // memo boundary still sees those edits; native metadata is replaced on sync.
  const snapshot = useMemo(() => ({ ...message }), [message.id, message.role, message.content, message.timestamp, message.metadata]);
  return <SavedChatMessage message={snapshot} sessionWorking={props.sessionWorking} onAnswerRequest={props.onAnswerRequest} {...actions} />;
}

const SavedChatMessage = memo(function SavedChatMessage({ message, sessionWorking = false, onAnswerRequest, onEdit, onFork, onDelete, onRetry }: ChatMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const { thinking, text } = isUser ? { thinking: '', text: displayUserText(watchUserText(message.content)) } : splitThinking(message.content);
  const reply = historyReply(text, message.metadata?.segments as Segment[] | undefined);

  const copy = async () => {
    const segments = reply.segments;
    const visible = isUser ? text : segments?.length ? segments.filter(part => part.type === 'text').map(part => readableReply(part.content ?? '')).join('\n\n') : readableReply(reply.text);
    await navigator.clipboard.writeText(isUser ? visible : displayAssistantText(studyReplyView(visible)?.text ?? visible));
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
            {text !== message.content && <OriginalMessage text={message.content} label="Request details" />}
          </div>
        ) : (
          <>
            <AgentReply text={reply.text} thinking={thinking} segments={reply.segments} streaming={sessionWorking} durationMs={message.metadata?.usage?.durationMs} requests={message.metadata?.interactions} onAnswerRequest={onAnswerRequest}/>
            {reply.interrupted && !sessionWorking && <p className="mt-1 text-[11px] text-foreground/45">This earlier reply was interrupted.</p>}
          </>
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
});
