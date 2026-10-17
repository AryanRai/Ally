import { describe, expect, it } from 'vitest';
import { CardManager, priorityFor } from './cards';
import { parseReply, TurnQueue, type TurnRequest, type TurnRunner } from './orchestrator';
import type { AgentEvent } from '../agent/types';
import type { AgentTurnInfo, AssistCard } from './types';

const req = (origin: 'proactive' | 'explicit', prompt: string): TurnRequest => ({ origin, prompt, images: [], decisions: [] });

/** A runner whose turns finish when the test says so. */
function fakeRunner() {
  const runs: Array<{ prompt: string; readOnly: boolean; emit: (ev: AgentEvent) => void; stopped: boolean }> = [];
  const run: TurnRunner = async (r, onEvent) => {
    const entry = { prompt: r.prompt, readOnly: r.readOnly, emit: onEvent, stopped: false };
    runs.push(entry);
    return { stop: () => { entry.stopped = true; onEvent({ kind: 'done' }); } };
  };
  return { run, runs };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('TurnQueue', () => {
  it('runs one turn at a time, read-only for proactive', async () => {
    const { run, runs } = fakeRunner();
    const turns: AgentTurnInfo[] = [];
    const q = new TurnQueue(run, t => turns.push(t));
    q.enqueue(req('proactive', 'p1'));
    q.enqueue(req('proactive', 'p2')); // merges into the waiting one? no: p1 is running, p2 waits
    await tick();
    expect(runs).toHaveLength(1);
    expect(runs[0].readOnly).toBe(true);
    runs[0].emit({ kind: 'text', text: 'NOTIFY: no' });
    runs[0].emit({ kind: 'done' });
    await tick();
    expect(runs).toHaveLength(2);
    expect(runs[1].prompt).toBe('p2');
  });

  it('merges waiting proactive triggers and lets explicit asks cut in', async () => {
    const { run, runs } = fakeRunner();
    const q = new TurnQueue(run, () => {});
    q.enqueue(req('proactive', 'p1'));
    await tick();
    q.enqueue(req('proactive', 'p2'));
    q.enqueue(req('proactive', 'p3')); // merged with p2
    expect(q.depth).toBe(1);
    q.enqueue(req('explicit', 'why?')); // cancels p1, runs before p3
    await tick();
    expect(runs[0].stopped).toBe(true);
    expect(runs[1]).toMatchObject({ prompt: 'why?', readOnly: false });
    runs[1].emit({ kind: 'done' });
    await tick();
    expect(runs[2].prompt).toBe('p3');
  });
});

describe('parseReply', () => {
  it('reads the note format and the no-op', () => {
    expect(parseReply('NOTIFY: yes\nTITLE: GNSS moved off DMA\nFrom earlier: DMA overran the ring buffer at 10 Hz.'))
      .toEqual({ notify: true, title: 'GNSS moved off DMA', body: 'From earlier: DMA overran the ring buffer at 10 Hz.' });
    expect(parseReply('NOTIFY: no').notify).toBe(false);
  });
});

describe('cards', () => {
  const card = (over: Partial<AssistCard>): AssistCard => ({ id: Math.random().toString(), turnId: 't', at: new Date(1_000_000).toISOString(), title: 'GNSS moved off DMA', body: 'b', priority: 'desktop', topic: 'dma gnss', sessionId: 's', ...over });

  it('maps outcomes to priority and caps them in quiet mode', () => {
    expect(priorityFor('HIGH_PRIORITY_TRIGGER', 'meeting', false)).toBe('watch');
    expect(priorityFor('HIGH_PRIORITY_TRIGGER', 'meeting', true)).toBe('passive');
    expect(priorityFor('EXPLICIT', 'meeting', true)).toBe('desktop');
    expect(priorityFor('INVOKE_CODEX_QUIETLY', 'lecture', false)).toBe('passive');
  });

  it('drops duplicates and cools dismissed topics', () => {
    const m = new CardManager();
    const first = m.admit(card({}), 1_000_000)!;
    expect(m.admit(card({}), 1_060_000)).toBeNull();
    m.dismiss(first.id, 1_100_000);
    expect(m.admit(card({ title: 'Another note', priority: 'passive' }), 1_200_000)).toBeNull();
    expect(m.admit(card({ title: 'You asked', body: 'An answer you asked for', priority: 'desktop' }), 1_200_000)).not.toBeNull();
  });
});
