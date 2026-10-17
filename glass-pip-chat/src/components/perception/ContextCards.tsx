import { useState } from 'react';
import { ChevronDown, MessageSquareText, X } from 'lucide-react';
import { MessageResponse } from '@/components/ai-elements/message';
import { cn } from '@/lib/utils';
import type { PerceptionState } from '@/hooks/usePerception';
import CardUi from './CardUi';

const VISIBLE = new Set(['desktop', 'phone', 'watch']);
const MAX_SHOWN = 3;

/**
 * Proactive notes from the realtime session, stacked over the transcript.
 * Passive notes stay in the "earlier" list instead of popping up.
 */
export default function ContextCards({ perception }: { perception: PerceptionState }) {
  const { cards, dismiss, api } = perception;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const live = cards.filter(c => !c.dismissed && VISIBLE.has(c.priority)).slice(-MAX_SHOWN).reverse();
  const earlier = cards.filter(c => c.dismissed || !VISIBLE.has(c.priority)).reverse();
  if (!live.length && !earlier.length) return null;

  return (
    <div className="pointer-events-none absolute right-2 top-2 z-20 flex w-72 max-w-[85%] flex-col gap-1.5">
      {live.map(card => (
        <div key={card.id} className="pointer-events-auto rounded-lg border border-white/12 bg-[rgb(14,14,14)]/95 p-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-start gap-2">
            <span className={cn('mt-1 size-1.5 shrink-0 rounded-full', card.priority === 'watch' ? 'bg-amber-400' : 'bg-foreground/60')} />
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(e => (e === card.id ? null : card.id))}>
              <p className="text-[12px] font-medium leading-snug text-foreground">{card.title}</p>
              {expanded !== card.id && <p className="mt-0.5 line-clamp-2 text-[11.5px] font-light leading-snug text-foreground/65">{card.body}</p>}
              {expanded !== card.id && card.ui?.length ? <p className="mt-0.5 text-[10px] text-foreground/40">+ {card.ui.length} detail{card.ui.length === 1 ? '' : 's'}</p> : null}
            </button>
            <button type="button" onClick={() => dismiss(card.id)} className="grid size-5 shrink-0 place-items-center rounded text-foreground/40 hover:bg-white/10 hover:text-foreground" title="Dismiss (Ally will raise this topic less)">
              <X className="size-3" />
            </button>
          </div>
          {expanded === card.id && (
            <div className="mt-1.5 max-h-60 overflow-y-auto pl-3.5">
              <MessageResponse className="text-[12px] font-light leading-relaxed text-foreground/80">{card.body}</MessageResponse>
              {card.ui?.length ? <CardUi blocks={card.ui} onAsk={q => void api?.ask(q)} /> : null}
              <button type="button" onClick={() => void api?.ask(`Tell me more about: ${card.title}`)} className="mt-1.5 flex items-center gap-1 text-[11px] text-foreground/55 hover:text-foreground">
                <MessageSquareText className="size-3" /> Explain in full
              </button>
            </div>
          )}
        </div>
      ))}
      {earlier.length > 0 && (
        <div className="pointer-events-auto self-end">
          <button type="button" onClick={() => setShowEarlier(s => !s)} className="flex items-center gap-1 rounded-md border border-white/10 bg-[rgb(14,14,14)]/90 px-2 py-0.5 text-[10px] text-foreground/55 hover:text-foreground">
            {earlier.length} earlier note{earlier.length === 1 ? '' : 's'} <ChevronDown className={cn('size-3 transition-transform', showEarlier && 'rotate-180')} />
          </button>
          {showEarlier && (
            <div className="mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-white/10 bg-[rgb(14,14,14)]/95 p-1.5">
              {earlier.map(c => (
                <div key={c.id} className="rounded px-1.5 py-1 text-[11px] hover:bg-white/5" title={c.body}>
                  <span className="text-foreground/80">{c.title}</span>
                  <span className="ml-1.5 font-mono text-[9.5px] text-foreground/35">{new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
