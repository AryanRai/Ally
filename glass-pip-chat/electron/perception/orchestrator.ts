// Serializes agent turns for a perception session: one at a time, explicit asks
// first (they cancel a running proactive turn), related proactive triggers merged
// while waiting. Proactive turns are read-only; the relevance gate never
// authorizes actions.
import type { AgentEvent } from '../agent/types.js';
import { describeWindow } from './timeline.js';
import { CARD_UI_GUIDE } from './cardUi.js';
import type { AgentTurnInfo, ContextWindow, PerceptionMode, RelevanceDecision, TurnOrigin } from './types.js';

export interface TurnRequest {
  origin: TurnOrigin;
  prompt: string;
  images: string[];
  decisions: RelevanceDecision[];
  /** For explicit asks: the user's own question, shown on the card */
  question?: string;
}

export interface RunHandle { stop(): void }
/** Starts one agent turn. Proactive turns must run read-only. */
export type TurnRunner = (req: { prompt: string; images: string[]; readOnly: boolean }, onEvent: (ev: AgentEvent) => void) => Promise<RunHandle>;

export interface ParsedReply {
  notify: boolean;
  title: string;
  body: string;
}

const PROACTIVE_TIMEOUT_MS = 3 * 60_000;
const EXPLICIT_TIMEOUT_MS = 10 * 60_000;

const MODE_HINT: Record<PerceptionMode, string> = {
  meeting: 'The user is in a meeting. Only speak up for questions about past decisions, contradictions, or facts they will want right now.',
  lecture: 'The user is in a lecture. Connect new material to their project or explain a concept they are likely to need.',
  general: 'The user is working. Stay quiet unless the screen or audio shows something directly relevant to this conversation.',
};

/** Prompt for a proactive look at new observations. */
export function proactivePrompt(mode: PerceptionMode, decision: RelevanceDecision, window: ContextWindow): string {
  return [
    `[Ally realtime · ${mode} mode] Ally observed the following on the user's computer. ${MODE_HINT[mode]}`,
    `Why this was flagged: ${decision.scores.category.replace(/_/g, ' ')} (${decision.reasons[0] ?? ''}).`,
    `Observations (most recent last):\n${describeWindow(window)}`,
    [
      'Decide whether a short note would help the user right now. Use this conversation\'s history and the observations only.',
      'Never invent earlier decisions. If you recall one, say "From earlier:" and keep it faithful. Do not run tools or change anything.',
      'Reply in exactly this format:',
      'NOTIFY: yes',
      'TITLE: <at most 8 words>',
      '<1–3 short sentences>',
      'If nothing useful to add, reply with exactly: NOTIFY: no',
      CARD_UI_GUIDE,
    ].join('\n'),
  ].join('\n\n');
}

/** Prompt for something the user asked directly, with recent context attached. */
export function explicitPrompt(question: string, mode: PerceptionMode, window: ContextWindow): string {
  const context = describeWindow(window);
  return [
    question,
    context ? `\n[Context Ally observed in the last ${Math.round((window.toT - window.fromT) / 1000)} s · ${mode} mode]\n${context}` : '',
  ].join('');
}

export function parseReply(text: string): ParsedReply {
  const t = text.trim();
  const notify = /^NOTIFY:\s*(yes|no)/im.exec(t);
  if (!notify) {
    // The agent ignored the format: treat any substantial answer as a note
    const body = t.replace(/\s+/g, ' ').slice(0, 600);
    return { notify: body.length > 0, title: body.split(/[.!?]/)[0].slice(0, 60), body };
  }
  if (notify[1].toLowerCase() === 'no') return { notify: false, title: '', body: '' };
  const title = /^TITLE:\s*(.+)$/im.exec(t)?.[1].trim() ?? '';
  const body = t.replace(/^NOTIFY:.*$/im, '').replace(/^TITLE:.*$/im, '').trim();
  return { notify: !!(title || body), title: title || body.split(/[.!?]/)[0].slice(0, 60), body };
}

export class TurnQueue {
  private queue: Array<TurnRequest & { id: string }> = [];
  private running: { id: string; origin: TurnOrigin; handle?: RunHandle; timer?: ReturnType<typeof setTimeout>; cancelled?: boolean } | null = null;
  private seq = 0;

  constructor(
    private run: TurnRunner,
    private onTurn: (turn: AgentTurnInfo, req: TurnRequest, done: boolean) => void,
  ) {}

  get depth(): number {
    return this.queue.length;
  }

  get busy(): boolean {
    return !!this.running;
  }

  /** Returns the turn id. */
  enqueue(req: TurnRequest): string {
    const id = `turn-${Date.now()}-${++this.seq}`;
    if (req.origin === 'explicit') {
      // The user asked: put it first and stop a proactive turn in progress
      this.queue.unshift({ ...req, id });
      if (this.running?.origin === 'proactive') this.cancelRunning();
    } else {
      const waiting = this.queue.find(q => q.origin === 'proactive');
      if (waiting) {
        // Merge: one turn about the latest situation, citing every trigger
        waiting.prompt = req.prompt;
        waiting.images = req.images;
        waiting.decisions.push(...req.decisions);
        return waiting.id;
      }
      this.queue.push({ ...req, id });
    }
    this.onTurn({ id, origin: req.origin, decisionId: req.decisions.at(-1)?.id, state: 'queued', text: '', tools: [] }, req, false);
    void this.next();
    return id;
  }

  cancelRunning(): void {
    if (!this.running) return;
    this.running.cancelled = true;
    this.running.handle?.stop();
  }

  clear(): void {
    this.queue = [];
    this.cancelRunning();
  }

  private async next(): Promise<void> {
    if (this.running || !this.queue.length) return;
    const req = this.queue.shift()!;
    const turn: AgentTurnInfo = { id: req.id, origin: req.origin, decisionId: req.decisions.at(-1)?.id, state: 'running', startedAt: new Date().toISOString(), text: '', tools: [] };
    const running: NonNullable<TurnQueue['running']> = { id: req.id, origin: req.origin };
    this.running = running;
    this.onTurn({ ...turn }, req, false);

    let settled = false;
    const finish = (state: AgentTurnInfo['state'], error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(running.timer);
      Object.assign(turn, { state: running.cancelled && state !== 'error' ? 'cancelled' : state, error, endedAt: new Date().toISOString() });
      this.running = null;
      this.onTurn({ ...turn }, req, true);
      void this.next();
    };
    running.timer = setTimeout(() => { running.handle?.stop(); finish('error', 'Timed out'); }, req.origin === 'explicit' ? EXPLICIT_TIMEOUT_MS : PROACTIVE_TIMEOUT_MS);

    try {
      running.handle = await this.run({ prompt: req.prompt, images: req.images, readOnly: req.origin === 'proactive' }, ev => {
        if (settled) return;
        if (ev.kind === 'text') { turn.text += ev.text; this.onTurn({ ...turn }, req, false); }
        else if (ev.kind === 'tool_start') { turn.tools.push(ev.name); this.onTurn({ ...turn }, req, false); }
        else if (ev.kind === 'done') finish(ev.isError ? 'error' : 'done', ev.isError ? ev.error : undefined);
      });
      if (running.cancelled) running.handle.stop();
    } catch (e) {
      finish('error', e instanceof Error ? e.message : String(e));
    }
  }
}
