// Perception contracts live with the main process; the renderer re-exports them.
export type * from '../../electron/perception/types';
import type {
  AssistCard, AudioSource, CaptureToggles, Observation, PerceptionMode, PerceptionPush, PerceptionStatus,
} from '../../electron/perception/types';
import type { PublicPerceptionSettings } from '../../electron/perception/settings';
import type { AgentProvider } from '../../electron/agent/types';

export type { PublicPerceptionSettings };

export interface PerceptionStartOptions {
  provider: AgentProvider;
  sessionId: string;
  title: string;
  cwd?: string;
  mode: PerceptionMode;
  capture: CaptureToggles;
}

export interface PerceptionApi {
  status: () => Promise<PerceptionStatus>;
  cards: () => Promise<AssistCard[]>;
  recent: (ms: number) => Promise<Observation[]>;
  context: (ms?: number) => Promise<string>;
  start: (opts: PerceptionStartOptions) => Promise<PerceptionStatus>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  setMode: (mode: PerceptionMode) => Promise<void>;
  setCapture: (patch: Partial<CaptureToggles>) => Promise<void>;
  setQuiet: (quiet: boolean) => Promise<void>;
  /** Explicit button only: copy the selected Codex chat and work in the copy */
  fork: () => Promise<PerceptionStatus>;
  ask: (question: string, contextMs?: number) => Promise<string>;
  stopTurn: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  getSettings: () => Promise<PublicPerceptionSettings>;
  /** `jevApiKey` is write-only: it is never sent back */
  updateSettings: (patch: Partial<PublicPerceptionSettings> & { jevApiKey?: string }) => Promise<PublicPerceptionSettings>;
  audioBegin: (source: AudioSource, id: string) => void;
  audioChunk: (id: string, pcm: ArrayBuffer) => void;
  audioEnd: (source: AudioSource, id: string) => void;
  audioError: (source: AudioSource, message: string) => void;
  onEvent: (callback: (push: PerceptionPush) => void) => () => void;
}
