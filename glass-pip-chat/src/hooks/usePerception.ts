import { useCallback, useEffect, useRef, useState } from 'react';
import { SourceCapture, type CaptureSource } from '@/lib/perceptionAudio';
import type { AgentTurnInfo, AssistCard, Observation, PerceptionStatus, RelevanceDecision } from '@/types/perception';

const KEEP_OBSERVATIONS = 300;
const KEEP_DECISIONS = 100;
const KEEP_TURNS = 30;

/**
 * Renderer side of a perception session: mirrors engine status, keeps short
 * feeds for the cards and the debug panel, and runs audio capture for the
 * sources the session has switched on.
 */
export function usePerception() {
  const api = typeof window !== 'undefined' ? window.pip?.perception : undefined;
  const [status, setStatus] = useState<PerceptionStatus | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [decisions, setDecisions] = useState<RelevanceDecision[]>([]);
  const [turns, setTurns] = useState<AgentTurnInfo[]>([]);
  const [cards, setCards] = useState<AssistCard[]>([]);
  const [audioLevel, setAudioLevel] = useState<Record<CaptureSource, number>>({ microphone: 0, system_audio: 0 });
  const captures = useRef<Partial<Record<CaptureSource, SourceCapture>>>({});

  useEffect(() => {
    if (!api) return;
    void api.status().then(setStatus);
    void api.cards().then(setCards);
    return api.onEvent(push => {
      if (push.type === 'status') setStatus(push.status);
      else if (push.type === 'observation') setObservations(list => [...list, push.observation].slice(-KEEP_OBSERVATIONS));
      else if (push.type === 'decision') setDecisions(list => [...list, push.decision].slice(-KEEP_DECISIONS));
      else if (push.type === 'turn') setTurns(list => [...list.filter(t => t.id !== push.turn.id), push.turn].slice(-KEEP_TURNS));
      else if (push.type === 'card') setCards(list => [...list.filter(c => c.id !== push.card.id), push.card].slice(-50));
    });
  }, [api]);

  // Run audio capture to match the session's toggles
  const session = status?.session;
  const wantMic = !!session && session.state === 'running' && session.capture.microphone;
  const wantSystem = !!session && session.state === 'running' && session.capture.systemAudio;
  useEffect(() => {
    if (!api) return;
    const sink = {
      begin: (source: CaptureSource, id: string) => api.audioBegin(source, id),
      chunk: (id: string, pcm: ArrayBuffer) => api.audioChunk(id, pcm),
      end: (source: CaptureSource, id: string) => api.audioEnd(source, id),
      error: (source: CaptureSource, message: string) => api.audioError(source, message),
    };
    const want: Record<CaptureSource, boolean> = { microphone: wantMic, system_audio: wantSystem };
    for (const source of ['microphone', 'system_audio'] as const) {
      const running = captures.current[source];
      if (want[source] && !running) {
        const capture = new SourceCapture(source, sink);
        captures.current[source] = capture;
        capture.start().catch(e => {
          delete captures.current[source];
          api.audioError(source, e instanceof Error ? e.message : String(e));
        });
      } else if (!want[source] && running) {
        running.stop();
        delete captures.current[source];
      }
    }
  }, [api, wantMic, wantSystem]);

  // Stop capture when the window goes away
  useEffect(() => () => {
    for (const c of Object.values(captures.current)) c?.stop();
    captures.current = {};
  }, []);

  // Input levels for the live meters (cheap: 4 Hz)
  useEffect(() => {
    if (!wantMic && !wantSystem) return;
    const timer = setInterval(() => setAudioLevel({
      microphone: captures.current.microphone?.level ?? 0,
      system_audio: captures.current.system_audio?.level ?? 0,
    }), 250);
    return () => clearInterval(timer);
  }, [wantMic, wantSystem]);

  const dismiss = useCallback((id: string) => {
    setCards(list => list.map(c => (c.id === id ? { ...c, dismissed: true } : c)));
    void api?.dismiss(id);
  }, [api]);

  return { api, available: !!api, status, observations, decisions, turns, cards, audioLevel, dismiss };
}

export type PerceptionState = ReturnType<typeof usePerception>;
