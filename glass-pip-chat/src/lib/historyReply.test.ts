import { describe, expect, it } from 'vitest';
import { historyReply } from './historyReply';
import type { Segment } from '@/types/chat';

describe('saved interruption presentation', () => {
  it('handles the screenshot with reasoning/tools and a standalone generated footer without mutating history', () => {
    const segments: Segment[] = [
      { type: 'thinking', content: 'Checking the current build' },
      { type: 'tool', toolExecution: { id: 'read', name: 'Read', status: 'success', startTime: 1 } },
      { type: 'text', content: '⏹️ Stopped' },
    ];
    const before = structuredClone(segments);
    expect(historyReply('⏹️ Stopped', segments)).toEqual({ text: '', interrupted: true, segments: segments.slice(0, 2) });
    expect(segments).toEqual(before);
  });

  it('keeps partial reply text, earlier interruptions and reasoning in order', () => {
    const segments: Segment[] = [
      { type: 'text', content: 'An earlier quote: ⏹️ Stopped' },
      { type: 'thinking', content: 'Checking' },
      { type: 'text', content: 'Partial answer\n\n⏹️ Stopped' },
    ];
    const reply = historyReply('Partial answer\n\n⏹️ Stopped', segments);
    expect(reply.text).toBe('Partial answer');
    expect(reply.segments).toEqual([...segments.slice(0, 2), { type: 'text', content: 'Partial answer' }]);
    expect(reply.interrupted).toBe(true);
  });

  it('supports older unsegmented history and leaves ordinary prose/code unchanged', () => {
    expect(historyReply('Partial answer\n\n⏹️ Stopped')).toEqual({ text: 'Partial answer', interrupted: true, segments: undefined });
    for (const text of ['Stopped the old server, continuing now.', '```\n⏹️ Stopped\n```', 'Example: ⏹️ Stopped']) {
      expect(historyReply(text).text).toBe(text);
      expect(historyReply(text).interrupted).toBe(false);
    }
  });
});
