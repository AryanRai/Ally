import { startAgentRun } from '../agent/runner.js';
import { desktopInteraction } from '../agent/desktopApprovals.js';
import type { AgentEvent, AgentRunOptions } from '../agent/types.js';

/** Forwarding retains the destination's identity and the caller's chosen permissions. */
export function startForwardedRun(opts: AgentRunOptions & { sessionId: string }, emit: (runId: string, event: AgentEvent) => void, binary?: string) {
  return startAgentRun(opts, emit, binary,
    desktopInteraction(() => `${opts.provider}:${opts.sessionId}`), 'desktop');
}
