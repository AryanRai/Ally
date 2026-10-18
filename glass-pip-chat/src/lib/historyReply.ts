import type { Segment } from '@/types/chat';
import { compactReply } from './compactPresentation';

/** Separate Ally's generated interruption footer from saved reply content.
 * Keep the stored message and all earlier text/tool/reasoning segments intact. */
export function historyReply(text: string, segments?: Segment[]) {
  const reply = compactReply(text);
  if (!segments?.length) return { ...reply, segments };
  const last = segments.at(-1)!;
  const footer = last.type === 'text' ? compactReply(last.content ?? '') : undefined;
  if (!footer?.interrupted) return { ...reply, segments };
  const visible = segments.slice(0, -1);
  if (footer.text) visible.push({ ...last, content: footer.text });
  return { text: reply.text, interrupted: true, segments: visible };
}
