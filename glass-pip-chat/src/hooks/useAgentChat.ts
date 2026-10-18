import { useCallback, useEffect, useRef, useState } from 'react';
import type { Segment, ToolExecution } from '../types/chat';
import type { AgentConfig, AgentEvent, AgentPermission, AgentProvider, AgentUsage } from '../types/agent';

export interface AgentTurnCallbacks {
  onSegments: (segments: Segment[]) => void;
  onText: (text: string) => void;
  onThinking: (thinking: string) => void;
  /** Fired as soon as the agent reports its session id (new sessions only) */
  onSession?: (sessionId: string) => void;
  onQueuedInput?: (id: string, text: string) => void;
}

export interface AgentTurnResult {
  text: string;
  thinking: string;
  segments: Segment[];
  sessionId?: string;
  error?: string;
  stopped?: boolean;
  usage?: AgentUsage;
}

const PERMISSION_ORDER: AgentPermission[] = ['readonly', 'edit', 'full'];

/**
 * Runs Claude Code / Codex turns through the Electron agent bridge and turns
 * their event stream into the same Segment[] shape the agentic chat UI uses.
 */
export function useAgentChat() {
  const available = typeof window !== 'undefined' && !!window.pip?.agent;
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const activeRuns = useRef(new Map<string, { stop: () => void; steer: (text: string, mode?: 'auto' | 'steer' | 'queue') => Promise<'steered' | 'queued'> }>());

  useEffect(() => {
    if (!available) return;
    window.pip.agent!.getConfig().then(setConfig).catch(() => {});
  }, [available]);

  const updateConfig = useCallback(async (patch: Partial<AgentConfig>) => {
    if (!window.pip?.agent) return;
    setConfig(await window.pip.agent.updateConfig(patch));
  }, []);

  const cyclePermission = useCallback(() => {
    const current = config?.permission ?? 'edit';
    const next = PERMISSION_ORDER[(PERMISSION_ORDER.indexOf(current) + 1) % PERMISSION_ORDER.length];
    return updateConfig({ permission: next });
  }, [config, updateConfig]);

  const pickFolder = useCallback(async (current?: string) => {
    if (!window.pip?.agent) return null;
    return window.pip.agent.pickFolder(current);
  }, []);

  const runTurn = useCallback(async (
    opts: {
      provider: AgentProvider;
      prompt: string;
      model: string;
      cwd?: string;
      sessionId?: string;
      robot?: { instructions: string };
      images?: string[];
    },
    cb: AgentTurnCallbacks,
    chatKey = 'default',
  ): Promise<AgentTurnResult> => {
    const agent = window.pip?.agent;
    if (!agent) throw new Error('Claude Code / Codex need the desktop app');
    if (activeRuns.current.has(chatKey)) throw new Error('This chat is already working');

    const segments: Segment[] = [];
    const tools = new Map<string, ToolExecution>();
    let text = '';
    let thinking = '';
    let sessionId = opts.sessionId;

    // Snapshot so React sees a new array and the persisted copy can't be mutated later
    const emitSegments = () => cb.onSegments(segments.map(s => ({ ...s, toolExecution: s.toolExecution && { ...s.toolExecution } })));

    const appendText = (chunk: string) => {
      text += chunk;
      const last = segments[segments.length - 1];
      if (last?.type === 'text') last.content = (last.content ?? '') + chunk;
      else segments.push({ type: 'text', content: chunk.replace(/^\s+/, '') });
      cb.onText(text);
      emitSegments();
    };

    return new Promise<AgentTurnResult>((resolve, reject) => {
      let runId: string | null = null;
      let settled = false;
      let cancelRequested = false;
      const pending: Array<{ runId: string; event: AgentEvent }> = [];

      const finish = (result: Partial<AgentTurnResult>) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        activeRuns.current.delete(chatKey);
        // Anything still running when the turn ends was interrupted
        for (const t of tools.values()) {
          if (t.status === 'executing') { t.status = 'error'; t.error = 'Interrupted'; t.endTime = Date.now(); }
        }
        resolve({ text: text.trim(), thinking, segments: segments.map(s => ({ ...s })), sessionId, ...result });
      };

      const handle = ({ event: ev }: { runId: string; event: AgentEvent }) => {
        if (settled) return;
        switch (ev.kind) {
          case 'input':
            if (ev.queuedId && ev.mode === 'steered') cb.onQueuedInput?.(ev.queuedId, ev.text);
            break;
          case 'continuation':
            appendText('\n\n');
            break;
          case 'session':
            if (ev.sessionId !== sessionId) {
              sessionId = ev.sessionId;
              cb.onSession?.(ev.sessionId);
            }
            break;
          case 'text':
            appendText(ev.text);
            break;
          case 'thinking': {
            thinking += ev.text;
            // Reasoning stays in order between tool calls, like Codex shows it
            const last = segments[segments.length - 1];
            if (last?.type === 'thinking') last.content = (last.content ?? '') + ev.text;
            else segments.push({ type: 'thinking', content: ev.text.replace(/^\s+/, '') });
            cb.onThinking(thinking);
            emitSegments();
            break;
          }
          case 'tool_update': {
            const exec = tools.get(ev.id);
            if (!exec) break;
            exec.parameters = { ...exec.parameters, ...ev.input };
            emitSegments();
            break;
          }
          case 'tool_start': {
            const exec: ToolExecution = {
              id: ev.id, name: ev.name, parameters: ev.input, status: 'executing', startTime: Date.now(),
            };
            tools.set(ev.id, exec);
            segments.push({ type: 'tool', toolExecution: exec });
            emitSegments();
            break;
          }
          case 'tool_end': {
            const exec = tools.get(ev.id);
            if (!exec) break;
            exec.status = ev.isError ? 'error' : 'success';
            exec.endTime = Date.now();
            if (ev.isError) exec.error = (ev.output || 'Tool failed').slice(0, 2000);
            else exec.result = (ev.output ?? '').slice(0, 4000);
            if (ev.images?.length) exec.images = ev.images;
            emitSegments();
            break;
          }
          case 'done':
            if (ev.sessionId) sessionId = ev.sessionId;
            finish({ ...(ev.isError && !cancelRequested ? { error: ev.error || 'Agent failed' } : {}), stopped: cancelRequested, usage: ev.usage });
            break;
          case 'stderr':
            break;
        }
      };

      // Events can arrive before `send` resolves with the run id; buffer them
      const unsubscribe = agent.onEvent(data => {
        if (runId === null) pending.push(data);
        else if (data.runId === runId) handle(data);
      });

      const cancel = () => {
        if (settled || cancelRequested) return;
        cancelRequested = true;
        if (runId !== null) {
          void agent.stop(runId).catch(error => finish({ error: `Could not stop: ${String(error)}` }));
        }
      };
      const inputRequests = new Map<string, string>();
      activeRuns.current.set(chatKey, { stop: cancel, steer: async (text, intent = 'auto') => {
        if (!runId || settled || cancelRequested) throw new Error('This response is not accepting input yet. Your draft is kept.');
        const requestId = inputRequests.get(intent + text) ?? crypto.randomUUID();
        inputRequests.set(intent + text, requestId);
        const mode = await agent.steer(runId, text, requestId, intent);
        inputRequests.delete(intent + text);
        return mode;
      } });

      agent.send(opts)
        .then(id => {
          runId = id;
          for (const data of pending.splice(0)) if (data.runId === id) handle(data);
          if (cancelRequested && !settled) {
            void agent.stop(id).catch(error => finish({ error: `Could not stop: ${String(error)}` }));
          }
        })
        .catch(err => {
          settled = true;
          unsubscribe();
          activeRuns.current.delete(chatKey);
          reject(err);
        });
    });
  }, []);

  const stop = useCallback((chatKey = 'default') => {
    const run = activeRuns.current.get(chatKey);
    if (!run) return false;
    run.stop();
    return true;
  }, []);

  const steer = useCallback(async (text: string, mode: 'auto' | 'steer' | 'queue' = 'auto', chatKey = 'default') => {
    const run = activeRuns.current.get(chatKey);
    if (!run) throw new Error('This response has finished. Send your message again.');
    return run.steer(text, mode);
  }, []);

  return { steer, available, config, updateConfig, cyclePermission, pickFolder, runTurn, stop };
}
