import { MessageResponse } from '@/components/ai-elements/message';
import CompactMarkdown from './CompactMarkdown';
import { displayAssistantText } from '@/lib/messageDisplay';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { watchReplyView } from '@/lib/watchPresentation';

export function OriginalMessage({ text, label = 'Original message' }: { text: string; label?: string }) {
  return <details className="my-1 text-[11px] text-foreground/40">
    <summary className="cursor-pointer select-none hover:text-foreground/70">{label}</summary>
    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-secondary/40 p-3 font-mono text-[11px]">{text}</pre>
  </details>;
}

/** Watch widgets are read-only here; they never execute actions or start timers. */
function WatchWidget({ component: c }: { component: Record<string, unknown> }) {
  const items = c.items as string[] | undefined;
  const actions = c.actions as { label: string; prompt: string }[] | undefined;
  return <div className="rounded-xl border border-border bg-secondary/30 px-3.5 py-3 text-[12px] leading-relaxed">
    {!!c.title && <p className="mb-1 font-medium text-foreground/90">{String(c.title)}</p>}
    {!!c.body && <p className="whitespace-pre-wrap text-foreground/70">{String(c.body)}</p>}
    {items && <ul className="list-disc space-y-1 pl-4 text-foreground/75">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>}
    {c.type === 'progress' && <progress aria-label={String(c.title || 'Progress')} value={Number(c.progress)} max={1} className="mt-2 h-1.5 w-full accent-current" />}
    {c.type === 'timer' && <p className="text-foreground/60">{Number(c.seconds)} seconds · Start on your watch</p>}
    {actions && <details className="text-foreground/60"><summary className="cursor-pointer">Suggested follow-ups · available on watch</summary>
      {actions.map((a, i) => <p key={i} className="mt-2"><strong>{a.label}</strong><br />{a.prompt}</p>)}
    </details>}
  </div>;
}

export default function WatchReplyContent({ content, streaming = false, compact = false }: { content: string; streaming?: boolean; compact?: boolean }) {
  const reply = watchReplyView(content);
  if (!reply && streaming && /^\s*\{\s*"text"\s*:/.test(content)) {
    return <Shimmer className="text-xs" duration={1.2}>Receiving reply…</Shimmer>;
  }
  return <div className="min-w-0 space-y-2">
    {compact ? <CompactMarkdown>{displayAssistantText(reply?.text ?? content)}</CompactMarkdown> : <MessageResponse isAnimating={streaming} className="text-[13px] font-light leading-[1.75] text-foreground/85">
      {displayAssistantText(reply?.text ?? content)}
    </MessageResponse>}
    {!!reply?.components.length && <div className="grid gap-2">{reply.components.map((component, i) => <WatchWidget key={i} component={component} />)}</div>}
    {reply && !streaming && <OriginalMessage text={content} label="Watch message details" />}
  </div>;
}
