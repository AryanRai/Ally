import { describe, expect, it, vi } from 'vitest';
import { scoresFromJev } from './jev';
import { DEFAULT_THRESHOLDS, decide, fallbackScores, RelevanceGate, topicOf, type PolicyState } from './relevance';
import { Timeline } from './timeline';
import type { Observation, RelevanceDecision } from './types';

const SCOPE = 'Embedded firmware debugging: GNSS receiver driver on STM32, switched UART from DMA to interrupt-based handling because of buffer overruns';
const said = (t: number, text: string): Observation =>
  ({ kind: 'transcript.final', t, at: new Date(1_700_000_000_000 + t).toISOString(), source: 'system_audio', utteranceId: `u${t}`, text, startT: t - 800, endT: t });
const fresh = (): PolicyState => ({ topics: new Map(), triggers: [] });

describe('fallback scoring + policy', () => {
  it('escalates a relevant question from a meeting', () => {
    const text = 'Why did we switch the GNSS receiver away from DMA to interrupt handling?';
    const scores = fallbackScores(text, SCOPE, false);
    expect(scores.category).toBe('technical_question');
    const { outcome } = decide(scores, { mode: 'meeting', text, topic: topicOf(text), t: 1000, thresholds: DEFAULT_THRESHOLDS, state: fresh() });
    expect(['INVOKE_CODEX', 'HIGH_PRIORITY_TRIGGER']).toContain(outcome);
  });

  it('ignores unrelated small talk', () => {
    const text = 'Anyone want coffee before we start? The traffic was terrible today.';
    const { outcome } = decide(fallbackScores(text, SCOPE, false), { mode: 'meeting', text, topic: topicOf(text), t: 1000, thresholds: DEFAULT_THRESHOLDS, state: fresh() });
    expect(outcome).toBe('IGNORE');
  });

  it('suppresses a repeated topic inside the cooldown and respects the rate limit', () => {
    const text = 'Why did we move the GNSS UART off DMA?';
    const scores = fallbackScores(text, SCOPE, false);
    const topic = topicOf(text);
    const state = fresh();
    state.topics.set(topic, 1000);
    expect(decide(scores, { mode: 'meeting', text, topic, t: 30_000, thresholds: DEFAULT_THRESHOLDS, state }).outcome).toBe('BUFFER_ONLY');
    const busy = fresh();
    busy.triggers = Array.from({ length: DEFAULT_THRESHOLDS.maxTriggersPer10Min }, (_, i) => 1000 + i);
    const r = decide(scores, { mode: 'meeting', text, topic, t: 60_000, thresholds: DEFAULT_THRESHOLDS, state: busy });
    expect(r.outcome).toBe('BUFFER_ONLY');
    expect(r.reasons.join(' ')).toMatch(/rate limit/);
  });

  it('is quieter in general mode', () => {
    const text = 'The GNSS driver uses an interrupt per byte now.';
    const scores = { ...fallbackScores(text, SCOPE, false), relevant: 0.6, question: 0.1, canHelp: 0.5, proactiveUseful: 0.4 };
    const meeting = decide(scores, { mode: 'meeting', text, topic: 'x', t: 1, thresholds: DEFAULT_THRESHOLDS, state: fresh() }).outcome;
    const general = decide(scores, { mode: 'general', text, topic: 'x', t: 1, thresholds: DEFAULT_THRESHOLDS, state: fresh() }).outcome;
    expect(meeting).toBe('INVOKE_CODEX_QUIETLY');
    expect(general).toBe('BUFFER_ONLY');
  });
});

describe('Jev answers', () => {
  it('maps nouls, score and choice', () => {
    const s = scoresFromJev({
      relevant: { type: 'noul', noul: 0.9 },
      question: { type: 'noul', noul: 0.95 },
      urgency: { type: 'score', score: 2, legend: { 0: 'a', 1: 'b', 2: 'c' } },
      category: { type: 'choice', choice: 'technical_question', confidence: 0.8 },
    });
    expect(s).toMatchObject({ relevant: 0.9, question: 0.95, urgency: 1, category: 'technical_question', categoryConfidence: 0.8, interrupt: 0 });
  });
});

describe('RelevanceGate', () => {
  const gate = (jev: { enabled: boolean }, ask?: any) => {
    const decisions: RelevanceDecision[] = [];
    const timeline = new Timeline();
    const g = new RelevanceGate({
      mode: () => 'meeting',
      scope: () => SCOPE,
      recentNotes: () => [],
      context: ms => timeline.window(ms),
      jev: () => ({ ...jev }),
      thresholds: () => DEFAULT_THRESHOLDS,
      onDecision: d => decisions.push(d),
      ask,
    }, 0);
    return { g, decisions };
  };

  it('batches a prerecorded timeline and reports degraded mode without Jev', async () => {
    const { g, decisions } = gate({ enabled: false });
    g.observe(said(1000, 'So about the GNSS driver.'));
    g.observe(said(2500, 'Why did we switch away from DMA?'));
    await g.evaluate();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].observations).toEqual([1000, 2500]);
    expect(decisions[0].engine).toBe('fallback');
    expect(decisions[0].reasons.join(' ')).toMatch(/Jev not configured/);
  });

  it('uses Jev when configured and falls back visibly when it fails', async () => {
    const ask = vi.fn().mockResolvedValueOnce({ relevant: 0.9, question: 0.9, newTopic: 0.2, canHelp: 0.9, proactiveUseful: 0.8, interrupt: 0.8, urgency: 0.9, category: 'technical_question', categoryConfidence: 0.9 })
      .mockRejectedValueOnce(new Error('Jev returned 503'));
    const { g, decisions } = gate({ enabled: true }, ask);
    g.observe(said(1000, 'Why did we switch the GNSS UART away from DMA?'));
    await g.evaluate();
    expect(decisions[0]).toMatchObject({ engine: 'jev', outcome: 'HIGH_PRIORITY_TRIGGER' });
    g.observe(said(400_000, 'What about the IMU sampling rate?'));
    await g.evaluate();
    expect(decisions[1].engine).toBe('fallback');
    expect(decisions[1].reasons.join(' ')).toMatch(/Jev unavailable: Jev returned 503/);
  });
});
