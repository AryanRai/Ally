// Relevance gate between perception and the agent. A classifier (Jev, or the
// fallback heuristics) scores a batch of new observations; a deterministic
// policy turns scores into an outcome with cooldowns, dedupe and rate limits.
// Classifier output never authorizes actions; it only decides whether
// unsolicited context deserves the agent's attention.
import { askJev, type JevConfig } from './jev.js';
import { askVertex, type VertexConfig } from './vertex.js';
import { describeWindow } from './timeline.js';
import type {
  ContextWindow, Observation, PerceptionMode, RelevanceCategory, RelevanceDecision, RelevanceOutcome, RelevanceScores, RelevanceThresholds,
} from './types.js';

export const DEFAULT_THRESHOLDS: RelevanceThresholds = {
  invoke: 0.62,
  quiet: 0.45,
  highPriority: 0.8,
  topicCooldownMs: 3 * 60_000,
  maxTriggersPer10Min: 6,
};

/** Meetings and lectures are where proactive help pays off; elsewhere be quieter. */
const MODE_OFFSET: Record<PerceptionMode, number> = { meeting: 0, lecture: 0, general: 0.1 };

const STOP = new Set(('a an and are as at be but by can could did do does for from had has have how i if in into is it its just like me my no not of on or our so that the their them then there these they this to was we were what when where which who why will with would you your yeah okay ok um uh right so going get got gonna want know think really very also about out up one two').split(' '));

export const keywords = (text: string): string[] =>
  text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

/** Top keywords as a stable topic key ("dma gnss interrupt"). */
export function topicOf(text: string, n = 3): string {
  const counts = new Map<string, number>();
  for (const w of keywords(text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([w]) => w).sort().join(' ');
}

const QUESTION_START = /^(why|what|how|when|where|who|which|can|could|should|would|is|are|do|does|did|will|have|has)\b/i;
const DECISION = /\b(we('| a)?re going (to|with)|decided|decision|let'?s (use|go with|switch)|we('| wi)?ll (use|go with|switch)|agreed)\b/i;
const ACTION = /\b(remind me|can you|could you|please|todo|to-do|follow up|action item|make sure)\b/i;
const EXPLAIN = /\b(means|is called|definition|defined as|for example|in other words|the idea is)\b/i;

/** Heuristic scores when Jev is unavailable. Deliberately conservative. */
export function fallbackScores(text: string, scope: string, screenChanged: boolean): RelevanceScores {
  const sentences = text.split(/(?<=[.?!])\s+/);
  const isQuestion = sentences.some(s => s.trim().endsWith('?') || QUESTION_START.test(s.trim()));
  const scopeWords = new Set(keywords(scope));
  const words = keywords(text);
  const hits = words.filter(w => scopeWords.has(w)).length;
  const relevant = words.length ? Math.min(1, (hits / Math.min(words.length, 12)) * 2.5) : 0;
  const decision = DECISION.test(text);
  const action = ACTION.test(text);
  const explain = EXPLAIN.test(text);
  let category: RelevanceCategory = 'irrelevant';
  if (relevant < 0.15 && !screenChanged) category = 'irrelevant';
  else if (action) category = 'action_request';
  else if (decision) category = 'decision_detected';
  else if (isQuestion) category = 'technical_question';
  else if (explain) category = 'concept_explanation';
  else if (screenChanged && !text.trim()) category = 'important_screen_change';
  else category = 'relevant_discussion';
  const question = isQuestion ? 0.8 : 0.1;
  const canHelp = Math.min(1, relevant * (isQuestion || explain || decision ? 1.1 : 0.6));
  return {
    relevant,
    question,
    newTopic: decision || screenChanged ? 0.6 : 0.2,
    canHelp,
    proactiveUseful: Math.min(1, relevant * (isQuestion || decision ? 0.9 : 0.5)),
    interrupt: isQuestion && relevant > 0.6 ? 0.6 : 0.15,
    urgency: isQuestion && relevant > 0.5 ? 0.7 : action ? 0.5 : 0.2,
    category,
    categoryConfidence: 0.5,
  };
}

export interface PolicyState {
  /** topic → last trigger time (ms, monotonic) */
  topics: Map<string, number>;
  /** trigger times (ms, monotonic) */
  triggers: number[];
}

/** Deterministic outcome from scores. Pure: all history comes in via `state`. */
export function decide(
  scores: RelevanceScores,
  ctx: { mode: PerceptionMode; text: string; topic: string; t: number; thresholds: RelevanceThresholds; state: PolicyState },
): { outcome: RelevanceOutcome; reasons: string[] } {
  const { thresholds: th, mode, state } = ctx;
  const offset = MODE_OFFSET[mode];
  const reasons: string[] = [];
  const combined = scores.relevant * 0.45 + Math.max(scores.question, scores.canHelp) * 0.35 + scores.proactiveUseful * 0.2;
  reasons.push(`combined ${combined.toFixed(2)} (relevant ${scores.relevant.toFixed(2)}, question ${scores.question.toFixed(2)}, help ${scores.canHelp.toFixed(2)})`);

  if (scores.category === 'irrelevant' && scores.categoryConfidence >= 0.6) return { outcome: 'IGNORE', reasons: [...reasons, 'classified irrelevant'] };
  if (scores.relevant < 0.15 && scores.canHelp < 0.3) return { outcome: 'IGNORE', reasons: [...reasons, 'unrelated to the selected chat'] };
  if (combined < th.quiet + offset) return { outcome: 'BUFFER_ONLY', reasons: [...reasons, `below quiet threshold ${(th.quiet + offset).toFixed(2)}`] };

  // A question that is still being asked: wait for the rest of it
  if (scores.question >= 0.6 && keywords(ctx.text).length < 3) return { outcome: 'WAIT_FOR_MORE_CONTEXT', reasons: [...reasons, 'question too short to act on yet'] };

  const lastTopic = ctx.topic ? state.topics.get(ctx.topic) : undefined;
  if (lastTopic != null && ctx.t - lastTopic < th.topicCooldownMs) {
    return { outcome: 'BUFFER_ONLY', reasons: [...reasons, `topic "${ctx.topic}" handled ${Math.round((ctx.t - lastTopic) / 1000)}s ago`] };
  }
  const recentTriggers = state.triggers.filter(x => ctx.t - x < 10 * 60_000).length;
  if (recentTriggers >= th.maxTriggersPer10Min) return { outcome: 'BUFFER_ONLY', reasons: [...reasons, `rate limit: ${recentTriggers} triggers in 10 min`] };

  if (combined >= th.highPriority + offset && scores.interrupt >= 0.7 && scores.urgency >= 0.6) {
    return { outcome: 'HIGH_PRIORITY_TRIGGER', reasons: [...reasons, 'urgent and worth interrupting'] };
  }
  if (combined >= th.invoke + offset) return { outcome: 'INVOKE_CODEX', reasons: [...reasons, `above invoke threshold ${(th.invoke + offset).toFixed(2)}`] };
  return { outcome: 'INVOKE_CODEX_QUIETLY', reasons: [...reasons, 'useful but not worth interrupting'] };
}

export const isTrigger = (o: RelevanceOutcome) => o === 'INVOKE_CODEX' || o === 'INVOKE_CODEX_QUIETLY' || o === 'HIGH_PRIORITY_TRIGGER';

/** The state Jev sees: mode, chat scope, recent notes, then only the new observations. */
export function buildState(o: { mode: PerceptionMode; scope: string; recentNotes: string[]; earlier: string; fresh: string }): string {
  return [
    `Mode: ${o.mode}`,
    `Selected conversation (scope): ${o.scope || '(none)'}`,
    o.recentNotes.length ? `Recently shown to the user: ${o.recentNotes.slice(-3).join(' | ')}` : '',
    o.earlier ? `Earlier context:\n${o.earlier}` : '',
    `New observations:\n${o.fresh}`,
  ].filter(Boolean).join('\n\n');
}

export interface GateDeps {
  mode: () => PerceptionMode;
  scope: () => string;
  recentNotes: () => string[];
  /** Context before the batch, for continuity */
  context: (ms: number) => ContextWindow;
  jev: () => JevConfig & { enabled: boolean };
  provider?: () => 'jev' | 'vertex' | 'heuristic';
  vertex?: () => VertexConfig;
  askVertex?: typeof askVertex;
  thresholds: () => RelevanceThresholds;
  onDecision: (d: RelevanceDecision) => void;
  ask?: typeof askJev;
}

/**
 * Batches new observations and evaluates them: soon after a finished sentence
 * (a short pause lets related segments merge) or after a meaningful screen change.
 */
export class RelevanceGate {
  private batch: Observation[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private evaluating = false;
  private state: PolicyState = { topics: new Map(), triggers: [] };
  private seq = 0;
  private generation = 0;
  degradedReason?: string;
  engine: 'jev' | 'vertex' | 'fallback' = 'fallback';

  constructor(private deps: GateDeps, private settleMs = 1500) {}

  observe(o: Observation): void {
    if (o.kind !== 'transcript.final' && o.kind !== 'screen.ocr' && o.kind !== 'screen.window_changed') return;
    this.batch.push(o);
    // Questions get evaluated sooner; everything else waits a little to merge
    const quick = o.kind === 'transcript.final' && /\?\s*$/.test(o.text);
    this.schedule(quick ? 400 : this.settleMs);
  }

  /** Record that a topic was acted on (also for explicit asks, to avoid repeats). */
  noteTrigger(topic: string, t = performance.now()): void {
    if (topic) this.state.topics.set(topic, t);
    this.state.triggers.push(t);
    this.state.triggers = this.state.triggers.filter(x => t - x < 10 * 60_000);
  }

  reset(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.batch = [];
    this.state = { topics: new Map(), triggers: [] };
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.evaluate(), ms);
  }

  async evaluate(): Promise<RelevanceDecision | null> {
    this.timer = null;
    if (this.evaluating) { this.schedule(500); return null; }
    const batch = this.batch.splice(0);
    if (!batch.length) return null;
    this.evaluating = true;
    const generation = this.generation;
    const started = performance.now();
    try {
      const fresh = describeWindow({
        fromT: batch[0].t, toT: batch.at(-1)!.t,
        transcript: batch.filter((o): o is ContextWindow['transcript'][number] => o.kind === 'transcript.final'),
        windows: batch.filter((o): o is ContextWindow['windows'][number] => o.kind === 'screen.window_changed'),
        snapshots: [],
        ocr: batch.filter((o): o is ContextWindow['ocr'][number] => o.kind === 'screen.ocr'),
      }, 3000);
      const spoken = batch.filter(o => o.kind === 'transcript.final').map(o => (o as any).text as string).join(' ');
      const screenChanged = batch.some(o => o.kind === 'screen.ocr');
      const excerpt = spoken || fresh;
      const earlierWindow = this.deps.context(45_000);
      earlierWindow.transcript = earlierWindow.transcript.filter(o => o.t < batch[0].t);
      earlierWindow.ocr = []; earlierWindow.windows = earlierWindow.windows.slice(-1);
      const state = buildState({ mode: this.deps.mode(), scope: this.deps.scope(), recentNotes: this.deps.recentNotes(), earlier: describeWindow(earlierWindow, 1500), fresh });

      let scores: RelevanceScores;
      const jev = this.deps.jev();
      const provider = this.deps.provider?.() ?? 'jev';
      if (provider === 'vertex') {
        try {
          const config = this.deps.vertex?.();
          if (!config) throw new Error('Google Cloud project not configured');
          scores = await (this.deps.askVertex ?? askVertex)(state, config);
          this.engine = 'vertex';
          this.degradedReason = undefined;
        } catch (e) {
          scores = fallbackScores(excerpt, this.deps.scope(), screenChanged);
          this.engine = 'fallback';
          this.degradedReason = `Gemini unavailable: ${e instanceof Error ? e.message : String(e)}`;
        }
      } else if (provider === 'jev' && jev.enabled) {
        try {
          scores = await (this.deps.ask ?? askJev)(state, jev);
          this.engine = 'jev';
          this.degradedReason = undefined;
        } catch (e) {
          scores = fallbackScores(excerpt, this.deps.scope(), screenChanged);
          this.engine = 'fallback';
          this.degradedReason = `Jev unavailable: ${e instanceof Error ? e.message : String(e)}`;
        }
      } else {
        scores = fallbackScores(excerpt, this.deps.scope(), screenChanged);
        this.engine = 'fallback';
        this.degradedReason = provider === 'heuristic' ? 'Basic relevance selected (no remote classifier)' : 'Jev not configured (add a TypeSafe API key in Settings → Realtime)';
      }

      // A slow classifier must never deliver the previous session's observation
      // into a different chat after stop/start or a session switch.
      if (generation !== this.generation) return null;
      const t = batch.at(-1)!.t;
      const topic = topicOf(excerpt);
      const { outcome, reasons } = decide(scores, { mode: this.deps.mode(), text: spoken || excerpt, topic, t, thresholds: this.deps.thresholds(), state: this.state });
      if (outcome === 'WAIT_FOR_MORE_CONTEXT') this.batch.unshift(...batch); // re-evaluate with what comes next
      if (isTrigger(outcome)) this.noteTrigger(topic, t);
      const decision: RelevanceDecision = {
        id: `dec-${Date.now()}-${++this.seq}`,
        at: new Date().toISOString(),
        engine: this.engine,
        scores,
        outcome,
        reasons: this.engine === 'fallback' && this.degradedReason ? [...reasons, this.degradedReason] : reasons,
        observations: batch.map(o => o.t),
        excerpt: excerpt.slice(0, 400),
        topic,
        latencyMs: Math.round(performance.now() - started),
      };
      this.deps.onDecision(decision);
      return decision;
    } finally {
      this.evaluating = false;
    }
  }
}
