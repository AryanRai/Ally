import type { AgentEvent, AgentUsage } from '../agent/types.js';
import { browserActivity } from '../agent/browserActivity.js';

export interface WatchActivity { id: string; name: string; status: 'running' | 'done' | 'error' | 'interrupted'; detail: string; kind?: 'browser' | 'other'; context?: string }
export interface ActivityState { steps: WatchActivity[]; usage?: AgentUsage }

function describe(input: Record<string, unknown>): string {
  // Bound network payloads on the watch; don't copy image/base64 tool results.
  const target = input.command ?? input.cmd ?? input.file_path ?? input.path ?? input.query;
  return (typeof target === 'string' ? target : JSON.stringify(input)).slice(0, 1600);
}

export function recordActivity(state: ActivityState, event: AgentEvent): void {
  if (event.kind === 'tool_start') {
    const step: WatchActivity = { id: event.id, name: event.name.slice(0, 100), status: 'running', detail: describe(event.input ?? {}), ...(browserActivity(event.name, event.input) ?? (/cua_repl/i.test(event.name) ? { kind: 'other' as const } : {})) };
    const index = state.steps.findIndex(s => s.id === event.id);
    if (index >= 0) state.steps[index] = step; else state.steps.push(step);
    state.steps = state.steps.slice(-24);
  } else if (event.kind === 'tool_update') {
    const step = state.steps.find(s => s.id === event.id);
    if (step) { step.detail = describe(event.input); const browser = browserActivity(step.name, event.input); if (browser) { step.kind = browser.kind; if (browser.context !== 'Browser interaction' || !step.context) step.context = browser.context; } }
  } else if (event.kind === 'tool_end') {
    const step = state.steps.find(s => s.id === event.id);
    if (step) {
      step.status = event.isError ? 'error' : 'done';
      if (event.output) step.detail = `${step.detail}\n\n${event.output.slice(0, 1600)}`.trim();
    }
  } else if (event.kind === 'done') {
    state.usage = { ...event.usage, ...(event.costUsd !== undefined ? { costUsd: event.costUsd } : {}) };
    settleActivity(state);
  }
}

export function settleActivity(state: ActivityState): void {
  // A missing tool_end is not evidence that a tool succeeded.
  for (const step of state.steps) if (step.status === 'running') step.status = 'interrupted';
}
