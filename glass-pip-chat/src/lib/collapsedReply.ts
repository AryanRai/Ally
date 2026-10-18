import type { Segment } from '@/types/chat';
import { historyReply } from './historyReply';

/** Prefer the provider's phase; older/Claude replies use their last text item.
 * Earlier text and tools remain reachable as activity. Never split on prose. */
export function collapsedReply(text: string, segments?: Segment[]) {
  const reply = historyReply(text, segments);
  const parts = reply.segments?.filter(part => part.type !== 'thinking') ?? [];
  const textParts = parts.filter(part => part.type === 'text' && part.content?.trim());
  const latest = textParts.at(-1);
  const selected = latest?.phase === 'final_answer' && latest.itemId
    ? textParts.filter(part => part.itemId === latest.itemId)
    : latest ? [latest] : [];
  // Explicit commentary remains activity even if the native turn has ended.
  const commentaryOnly = !!selected.length && selected.every(part => part.phase === 'commentary');
  const selectedSet = new Set(selected);
  return {
    text: selected.length ? selected.map(part => part.content?.trim()).join('\n\n') : parts.length ? '' : reply.text,
    activity: parts.filter(part => !selectedSet.has(part) && (part.type === 'tool' || part.content?.trim())),
    interrupted: reply.interrupted,
    commentaryOnly,
  };
}
