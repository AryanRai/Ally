import { CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CardBlock } from '@/types/perception';

const TONE: Record<'info' | 'warning' | 'decision', string> = {
  info: 'border-sky-400/30 bg-sky-400/10 text-sky-100/90',
  warning: 'border-amber-400/35 bg-amber-400/10 text-amber-100/90',
  decision: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100/90',
};

/**
 * Renders an assist card's structured view. Blocks are validated in the main
 * process (electron/perception/cardUi.ts); this only ever renders text, never HTML.
 * Action buttons send a follow-up question; they don't run anything.
 */
export default function CardUi({ blocks, onAsk }: { blocks: CardBlock[]; onAsk: (question: string) => void }) {
  return (
    <div className="mt-1.5 space-y-1.5">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'facts':
            return (
              <dl key={i} className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11.5px]">
                {b.items.map((f, j) => [
                  <dt key={`k${j}`} className="text-foreground/45">{f.label}</dt>,
                  <dd key={`v${j}`} className="text-foreground/85">{f.value}</dd>,
                ])}
              </dl>
            );
          case 'list': {
            const List = b.ordered ? 'ol' : 'ul';
            return (
              <List key={i} className={cn('space-y-0.5 pl-4 text-[11.5px] text-foreground/80', b.ordered ? 'list-decimal' : 'list-disc')}>
                {b.items.map((it, j) => <li key={j}>{it}</li>)}
              </List>
            );
          }
          case 'table':
            return (
              <div key={i} className="overflow-x-auto rounded border border-white/10">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-white/5 text-foreground/55">
                    <tr>{b.columns.map((c, j) => <th key={j} className="px-1.5 py-1 font-medium">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-t border-white/5">{r.map((c, k) => <td key={k} className="px-1.5 py-1 align-top text-foreground/80">{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'callout':
            return <p key={i} className={cn('rounded border px-2 py-1 text-[11.5px]', TONE[b.tone])}>{b.text}</p>;
          case 'code':
            return <pre key={i} className="max-h-40 overflow-auto rounded border border-white/10 bg-black/40 p-1.5 font-mono text-[10.5px] text-foreground/80" title={b.language}>{b.code}</pre>;
          case 'progress':
            return (
              <div key={i} className="text-[11px]">
                <div className="flex justify-between text-foreground/60"><span>{b.label}</span><span className="font-mono">{Math.round(b.value * 100)}%</span></div>
                <div className="mt-0.5 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-foreground/70" style={{ width: `${b.value * 100}%` }} /></div>
              </div>
            );
          case 'actions':
            return (
              <div key={i} className="flex flex-wrap gap-1">
                {b.items.map((a, j) => (
                  <button key={j} type="button" onClick={() => onAsk(a.ask)} title={a.ask}
                    className="flex items-center gap-1 rounded-md border border-white/12 bg-white/5 px-1.5 py-0.5 text-[10.5px] text-foreground/75 hover:bg-white/10 hover:text-foreground">
                    <CornerDownRight className="size-2.5" />{a.label}
                  </button>
                ))}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
