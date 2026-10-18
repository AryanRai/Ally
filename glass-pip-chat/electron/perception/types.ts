// Contracts for Ally's realtime perception → relevance → agent pipeline.
// Shared by the main process and (via src/types/perception.ts) the renderer.

import type { AgentProvider } from '../agent/types.js';
import type { CardBlock } from './cardUi.js';

export type { CardBlock } from './cardUi.js';

export type PerceptionMode = 'meeting' | 'lecture' | 'general';
export type AudioSource = 'microphone' | 'system_audio';

/** Every observation carries monotonic time (ordering) and wall time (display). */
export interface Stamp {
  /** Milliseconds on the process's monotonic clock (performance.now) */
  t: number;
  /** ISO wall-clock time */
  at: string;
}

export type Observation =
  | (Stamp & { kind: 'transcript.partial'; source: AudioSource; utteranceId: string; text: string })
  | (Stamp & { kind: 'transcript.final'; source: AudioSource; utteranceId: string; text: string; startT: number; endT: number; speaker?: string })
  | (Stamp & { kind: 'audio.vad'; source: AudioSource; speaking: boolean })
  | (Stamp & { kind: 'screen.window_changed'; title: string; app: string })
  | (Stamp & { kind: 'screen.changed'; display: string; change: number; reason: 'content' | 'window' | 'manual' })
  | (Stamp & { kind: 'screen.snapshot'; display: string; path: string; width: number; height: number })
  | (Stamp & { kind: 'screen.ocr'; snapshot: string; text: string })
  | (Stamp & { kind: 'perception.error'; component: 'audio' | 'screen' | 'ocr' | 'relevance' | 'agent'; message: string });

export type ObservationKind = Observation['kind'];

/** "Give me the screen and transcript from the last N seconds." */
export interface ContextWindow {
  fromT: number;
  toT: number;
  transcript: Extract<Observation, { kind: 'transcript.final' }>[];
  windows: Extract<Observation, { kind: 'screen.window_changed' }>[];
  snapshots: Extract<Observation, { kind: 'screen.snapshot' }>[];
  ocr: Extract<Observation, { kind: 'screen.ocr' }>[];
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface CaptureToggles {
  microphone: boolean;
  systemAudio: boolean;
  screen: boolean;
}

export interface PerceptionSessionInfo {
  provider: AgentProvider;
  /** The chat Ally works in: the selected one, or a fork the user asked for */
  sessionId: string;
  /** Set when the user forked: the untouched original */
  forkedFrom?: string;
  title: string;
  cwd?: string;
  mode: PerceptionMode;
  state: 'running' | 'paused' | 'stopped';
  capture: CaptureToggles;
  /** Compact description of the selected chat, for the relevance gate */
  scope: string;
  startedAt: string;
}

// ---------------------------------------------------------------------------
// Relevance (Jev + deterministic policy)
// ---------------------------------------------------------------------------

export type RelevanceCategory =
  | 'irrelevant'
  | 'technical_question'
  | 'relevant_discussion'
  | 'decision_detected'
  | 'action_request'
  | 'concept_explanation'
  | 'potential_reminder'
  | 'important_screen_change';

export type RelevanceOutcome =
  | 'IGNORE'
  | 'BUFFER_ONLY'
  | 'WAIT_FOR_MORE_CONTEXT'
  | 'INVOKE_CODEX'
  | 'INVOKE_CODEX_QUIETLY'
  | 'HIGH_PRIORITY_TRIGGER';

/** What the classifier (Jev, or the fallback heuristics) said about a batch. */
export interface RelevanceScores {
  relevant: number;
  question: number;
  newTopic: number;
  canHelp: number;
  proactiveUseful: number;
  interrupt: number;
  /** 0 (can wait) – 1 (now) */
  urgency: number;
  category: RelevanceCategory;
  categoryConfidence: number;
}

export interface RelevanceDecision {
  id: string;
  at: string;
  /** 'jev' when the TypeSafe API answered; 'fallback' when it is unconfigured or failing */
  engine: 'jev' | 'vertex' | 'fallback';
  scores: RelevanceScores;
  outcome: RelevanceOutcome;
  /** Why the policy chose this outcome (thresholds, cooldowns, dedupe…) */
  reasons: string[];
  /** Observation times (t) this decision covered */
  observations: number[];
  /** Short text the decision was about */
  excerpt: string;
  topic: string;
  latencyMs: number;
}

export interface RelevanceThresholds {
  invoke: number;
  quiet: number;
  highPriority: number;
  /** Don't re-trigger the same topic within this many ms */
  topicCooldownMs: number;
  /** At most this many proactive agent turns per 10 minutes */
  maxTriggersPer10Min: number;
}

// ---------------------------------------------------------------------------
// Agent turns + cards
// ---------------------------------------------------------------------------

export type TurnOrigin = 'proactive' | 'explicit';

export interface AgentTurnInfo {
  id: string;
  origin: TurnOrigin;
  decisionId?: string;
  state: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  startedAt?: string;
  endedAt?: string;
  /** Streamed reply so far */
  text: string;
  tools: string[];
  error?: string;
}

/** Where a card may surface. Phone/watch are delivered by the notification bridge. */
export type CardPriority = 'silent' | 'passive' | 'desktop' | 'phone' | 'watch';

export interface AssistCard {
  id: string;
  turnId: string;
  decisionId?: string;
  at: string;
  title: string;
  body: string;
  priority: CardPriority;
  topic: string;
  /** Session it came from, so "open" can jump to the full answer */
  sessionId: string;
  /** Optional structured view the agent attached (validated, see cardUi.ts) */
  ui?: CardBlock[];
  dismissed?: boolean;
}

export interface PerceptionStatus {
  session: PerceptionSessionInfo | null;
  audio: Record<AudioSource, 'off' | 'listening' | 'speaking' | 'error'>;
  screen: 'off' | 'watching' | 'error';
  ocr: 'available' | 'unavailable' | 'unknown';
  relevance: { engine: 'jev' | 'vertex' | 'fallback'; degradedReason?: string; thresholds: RelevanceThresholds };
  queueDepth: number;
  activeTurn?: AgentTurnInfo;
  quiet: boolean;
  metrics: { observations: number; decisions: number; triggers: number; turns: number; lastDecisionMs?: number };
}

/** Everything the renderer hears from the engine. */
export type PerceptionPush =
  | { type: 'status'; status: PerceptionStatus }
  | { type: 'observation'; observation: Observation }
  | { type: 'decision'; decision: RelevanceDecision }
  | { type: 'turn'; turn: AgentTurnInfo }
  | { type: 'card'; card: AssistCard };
