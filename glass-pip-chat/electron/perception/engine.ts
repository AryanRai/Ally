// The perception session: wires capture → timeline → relevance gate → turn queue
// → cards, and reports everything to the renderer. One session at a time.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { startAgentRun, stopAgentRun } from '../agent/runner.js';
import { loadAgentSession } from '../agent/sessions.js';
import { loadCodexChat } from '../agent/codexHistory.js';
import { CodexRpc } from '../agent/codexRpc.js';
import type { AgentConfig, AgentProvider } from '../agent/types.js';
import { AudioTranscriber } from './audio.js';
import { CardManager, priorityFor } from './cards.js';
import { extractCardUi } from './cardUi.js';
import { explicitPrompt, parseReply, proactivePrompt, TurnQueue, type TurnRunner } from './orchestrator.js';
import { isTrigger, RelevanceGate } from './relevance.js';
import { buildScope } from './scope.js';
import { ScreenObserver } from './screen.js';
import { loadPerceptionSettings, savePerceptionSettings, type PerceptionSettings } from './settings.js';
import { describeWindow, now, Timeline } from './timeline.js';
import { createPlatformHelper } from './platformHelper.js';
import type {
  AgentTurnInfo, AssistCard, AudioSource, CaptureToggles, Observation, PerceptionMode, PerceptionPush, PerceptionSessionInfo, PerceptionStatus, RelevanceDecision,
} from './types.js';

const SESSION_FILE = () => path.join(app.getPath('userData'), 'perception-session.json');

function agentConfig(): AgentConfig {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'agent-config.json'), 'utf8')); }
  catch { return { defaultCwd: app.getPath('home'), permission: 'edit' }; }
}

export interface StartOptions {
  provider: AgentProvider;
  sessionId: string;
  title: string;
  cwd?: string;
  mode: PerceptionMode;
  capture: CaptureToggles;
}

export class PerceptionEngine {
  readonly timeline = new Timeline();
  private helper = createPlatformHelper();
  private screen: ScreenObserver | null = null;
  readonly audio: AudioTranscriber;
  private gate: RelevanceGate;
  private turns: TurnQueue;
  private cards = new CardManager();
  private settings: PerceptionSettings = loadPerceptionSettings();
  private session: PerceptionSessionInfo | null = null;
  private audioState: PerceptionStatus['audio'] = { microphone: 'off', system_audio: 'off' };
  private activeTurn?: AgentTurnInfo;
  private metrics = { decisions: 0, triggers: 0, turns: 0, lastDecisionMs: undefined as number | undefined };
  private turnDecision = new Map<string, RelevanceDecision | undefined>();

  constructor(private push: (p: PerceptionPush) => void) {
    this.audio = new AudioTranscriber(o => this.observe(o));
    this.gate = new RelevanceGate({
      mode: () => this.session?.mode ?? 'general',
      scope: () => this.session?.scope ?? '',
      recentNotes: () => this.cards.recentTitles(),
      context: ms => this.timeline.window(ms),
      jev: () => ({ enabled: this.settings.jevEnabled, apiKey: this.settings.jevApiKey, model: this.settings.jevModel }),
      thresholds: () => this.settings.thresholds,
      onDecision: d => this.onDecision(d),
    });
    this.turns = new TurnQueue(this.runner, (turn, req, done) => this.onTurn(turn, req.question, done));
    this.restore();
  }

  // ---- Session lifecycle ---------------------------------------------------

  async start(opts: StartOptions): Promise<PerceptionStatus> {
    this.stop();
    this.session = {
      provider: opts.provider, sessionId: opts.sessionId, title: opts.title, cwd: opts.cwd,
      mode: opts.mode, capture: opts.capture, state: 'running', scope: `Title: ${opts.title}`, startedAt: new Date().toISOString(),
    };
    this.persist();
    void this.refreshScope();
    await this.applyCapture();
    this.emitStatus();
    return this.status();
  }

  pause(): void {
    if (!this.session) return;
    this.session.state = 'paused';
    this.screen?.stop();
    this.audio.stopAll();
    this.persist();
    this.emitStatus();
  }

  async resume(): Promise<void> {
    if (!this.session) return;
    this.session.state = 'running';
    this.persist();
    await this.applyCapture();
    this.emitStatus();
  }

  stop(): void {
    this.screen?.stop();
    this.screen?.cleanup();
    this.screen = null;
    this.audio.stopAll();
    this.turns.clear();
    this.gate.reset();
    this.timeline.clear();
    this.cards.clear();
    if (this.session) this.session.state = 'stopped';
    this.session = null;
    try { fs.rmSync(SESSION_FILE(), { force: true }); } catch { /* ignore */ }
    this.emitStatus();
  }

  setMode(mode: PerceptionMode): void {
    if (!this.session) return;
    this.session.mode = mode;
    this.persist();
    this.emitStatus();
  }

  async setCapture(patch: Partial<CaptureToggles>): Promise<void> {
    if (!this.session) return;
    this.session.capture = { ...this.session.capture, ...patch };
    this.persist();
    await this.applyCapture();
    this.emitStatus();
  }

  setQuiet(quiet: boolean): void {
    this.settings = savePerceptionSettings({ quiet });
    this.emitStatus();
  }

  updateSettings(patch: Partial<PerceptionSettings>): PerceptionSettings {
    this.settings = savePerceptionSettings(patch);
    this.emitStatus();
    return this.settings;
  }

  /** Only on an explicit button press: copy the selected Codex chat and work in the copy. */
  async fork(): Promise<PerceptionStatus> {
    const s = this.session;
    if (!s) throw new Error('No active session');
    if (s.provider !== 'codex') throw new Error('Forking is only available for Codex chats.');
    const rpc = await CodexRpc.connect(agentConfig().codexPath);
    try {
      const forked = (await rpc.request('thread/fork', { threadId: s.sessionId })).thread;
      s.forkedFrom = s.forkedFrom ?? s.sessionId;
      s.sessionId = forked.id;
      s.title = `${s.title} (Ally)`;
      this.persist();
      this.emitStatus();
      return this.status();
    } finally {
      rpc.close();
    }
  }

  /** A question the user asked (typed, spoken or circled): no gating, recent context attached. */
  ask(question: string, contextMs = 30_000, images: string[] = []): string {
    const s = this.session;
    if (!s) throw new Error('Start a session first.');
    const window = this.timeline.window(contextMs, performance.now());
    const shots = images.length ? images : window.snapshots.slice(-1).map(x => x.path);
    return this.turns.enqueue({ origin: 'explicit', prompt: explicitPrompt(question, s.mode, window), images: shots, decisions: [], question });
  }

  stopTurn(): void {
    this.turns.cancelRunning();
  }

  dismissCard(id: string): void {
    const card = this.cards.dismiss(id);
    if (card) this.push({ type: 'card', card });
  }

  /** Recent context as text, e.g. for circle-to-ask in the regular chat. */
  contextText(ms = 30_000): string {
    return describeWindow(this.timeline.window(ms, performance.now()));
  }

  // ---- Audio from the renderer -------------------------------------------

  audioBegin(source: AudioSource, id: string): void {
    if (this.session?.state !== 'running') return;
    this.audio.begin(source, id);
    this.setAudioState(source, 'speaking');
  }

  audioChunk(id: string, pcm: Uint8Array): void {
    this.audio.write(id, pcm);
  }

  audioEnd(source: AudioSource, id: string): void {
    this.audio.end(source, id);
    this.setAudioState(source, this.session?.state === 'running' && this.captureOn(source) ? 'listening' : 'off');
  }

  audioError(source: AudioSource, message: string): void {
    this.setAudioState(source, 'error');
    this.observe({ ...now(), kind: 'perception.error', component: 'audio', message });
  }

  // ---- Status ----------------------------------------------------------------

  status(): PerceptionStatus {
    return {
      session: this.session ? { ...this.session } : null,
      audio: { ...this.audioState },
      screen: this.screen?.running ? 'watching' : 'off',
      ocr: this.screen?.ocrAvailable == null ? 'unknown' : this.screen.ocrAvailable ? 'available' : 'unavailable',
      relevance: { engine: this.gate.engine, degradedReason: this.gate.degradedReason, thresholds: this.settings.thresholds },
      queueDepth: this.turns.depth,
      activeTurn: this.activeTurn,
      quiet: this.settings.quiet,
      metrics: { observations: this.timeline.total, ...this.metrics },
    };
  }

  cardsList(): AssistCard[] {
    return this.cards.all();
  }

  recent(ms: number): Observation[] {
    return this.timeline.recent(ms, performance.now());
  }

  // ---- Internals -------------------------------------------------------------

  private captureOn(source: AudioSource): boolean {
    return !!this.session && (source === 'microphone' ? this.session.capture.microphone : this.session.capture.systemAudio);
  }

  private setAudioState(source: AudioSource, state: PerceptionStatus['audio'][AudioSource]): void {
    if (this.audioState[source] === state) return;
    this.audioState[source] = state;
    this.emitStatus();
  }

  private async applyCapture(): Promise<void> {
    const s = this.session;
    const running = s?.state === 'running';
    if (running && s!.capture.screen) {
      if (!this.screen) {
        this.screen = new ScreenObserver(o => this.observe(o), this.helper, {
          displayId: this.settings.displayId,
          // Ally's own window is not context
          ignore: w => /^(electron|glass[- ]pip[- ]chat|ally)$/i.test(w.app) || /Glass PiP Chat/i.test(w.title),
        });
      }
      await this.screen.start();
    } else {
      this.screen?.stop();
    }
    for (const source of ['microphone', 'system_audio'] as const) {
      const on = running && this.captureOn(source);
      if (!on) this.audioState[source] = 'off';
      else if (this.audioState[source] === 'off') this.audioState[source] = this.audio.unavailable() ? 'error' : 'listening';
    }
    if (running && (s!.capture.microphone || s!.capture.systemAudio)) {
      const reason = this.audio.unavailable();
      if (reason) this.observe({ ...now(), kind: 'perception.error', component: 'audio', message: reason });
    }
  }

  private observe(o: Observation): void {
    this.timeline.push(o);
    this.push({ type: 'observation', observation: o });
    if (this.session?.state === 'running') this.gate.observe(o);
  }

  private onDecision(d: RelevanceDecision): void {
    this.metrics.decisions++;
    this.metrics.lastDecisionMs = d.latencyMs;
    this.push({ type: 'decision', decision: d });
    if (!isTrigger(d.outcome) || !this.session) { this.emitStatus(); return; }
    this.metrics.triggers++;
    const t = Math.max(...d.observations);
    const window = this.timeline.window(60_000, t + 1);
    const images = window.snapshots.slice(-1).map(x => x.path);
    const id = this.turns.enqueue({ origin: 'proactive', prompt: proactivePrompt(this.session.mode, d, window), images, decisions: [d] });
    this.turnDecision.set(id, d);
    this.emitStatus();
  }

  private onTurn(turn: AgentTurnInfo, question: string | undefined, done: boolean): void {
    this.activeTurn = done ? undefined : turn;
    if (done) this.metrics.turns++;
    this.push({ type: 'turn', turn });
    if (done && turn.state === 'done' && this.session) {
      const decision = this.turnDecision.get(turn.id);
      this.turnDecision.delete(turn.id);
      const { text: replyText, ui } = extractCardUi(turn.text);
      const reply = question ? { notify: !!replyText.trim(), title: question.slice(0, 60), body: replyText.trim() } : parseReply(replyText);
      if (reply.notify) {
        const card = this.cards.admit({
          id: `card-${turn.id}`,
          turnId: turn.id,
          decisionId: decision?.id,
          at: new Date().toISOString(),
          title: reply.title,
          body: reply.body,
          ...(ui.length ? { ui } : {}),
          priority: priorityFor(question ? 'EXPLICIT' : decision?.outcome ?? 'INVOKE_CODEX_QUIETLY', this.session.mode, this.settings.quiet),
          topic: decision?.topic ?? '',
          sessionId: this.session.sessionId,
        });
        if (card) this.push({ type: 'card', card });
      }
    }
    this.emitStatus();
  }

  /** Turns go through Ally's normal agent runner (and its Codex desktop route). */
  private runner: TurnRunner = async (req, onEvent) => {
    const s = this.session;
    if (!s) throw new Error('No active session');
    const cfg = agentConfig();
    const runId = await startAgentRun(
      {
        provider: s.provider,
        prompt: req.prompt,
        cwd: s.cwd || cfg.defaultCwd,
        sessionId: s.sessionId,
        permission: req.readOnly ? 'readonly' : cfg.permission,
        images: req.images.filter(f => fs.existsSync(f)),
        codexDesktop: cfg.codexDesktop === true,
      },
      (_runId, ev) => onEvent(ev),
      s.provider === 'claude' ? cfg.claudePath : cfg.codexPath,
      undefined,
      'desktop',
    );
    return { stop: () => { stopAgentRun(runId); } };
  };

  private async refreshScope(): Promise<void> {
    const s = this.session;
    if (!s) return;
    try {
      const snapshot = s.provider === 'codex' ? await loadCodexChat(s.forkedFrom ?? s.sessionId) : loadAgentSession(s.provider, s.sessionId);
      if (this.session !== s) return;
      s.scope = buildScope(s.title, snapshot.messages);
      if (!s.cwd && snapshot.cwd) s.cwd = snapshot.cwd;
      this.persist();
      this.emitStatus();
    } catch (e) {
      this.observe({ ...now(), kind: 'perception.error', component: 'relevance', message: `Could not read the selected chat for scope: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  private persist(): void {
    if (!this.session) return;
    try { fs.writeFileSync(SESSION_FILE(), JSON.stringify(this.session, null, 2)); } catch { /* best effort */ }
  }

  /** After a restart, bring the last session back paused (capture needs a fresh go-ahead). */
  private restore(): void {
    try {
      const saved = JSON.parse(fs.readFileSync(SESSION_FILE(), 'utf8')) as PerceptionSessionInfo;
      if (saved?.sessionId) this.session = { ...saved, state: 'paused' };
    } catch { /* none */ }
  }

  private emitStatus(): void {
    this.push({ type: 'status', status: this.status() });
  }

  shutdown(): void {
    this.screen?.stop();
    this.screen?.cleanup();
    this.audio.stopAll();
    this.turns.clear();
    this.helper?.stop();
  }
}
