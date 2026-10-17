import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startAgentRun, stopAgentRun } from './runner.js';
import type { AgentProvider } from './types.js';

const cache = new Map<string, { expires: number; text: string }>();
const pending = new Map<string, Promise<string>>();

/** A separate, unsaved request: never inject a greeting prompt into the user's chat. */
export function generateGreeting(provider: AgentProvider, model = 'default', binary?: string): Promise<string> {
  const key = `${provider}:${model}:${binary ?? ''}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return Promise.resolve(saved.text);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = new Promise<string>((resolve, reject) => {
    let runId: string | undefined;
    let settled = false;
    let text = '';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const greeting = text.trim().replace(/^["'“]|["'”]$/g, '').replace(/\s+/g, ' ').slice(0, 100);
      if (error || !greeting) reject(error ?? new Error('No greeting returned'));
      else { cache.set(key, { expires: Date.now() + 6 * 60 * 60 * 1000, text: greeting }); resolve(greeting); }
    };
    const timer = setTimeout(() => { if (runId) stopAgentRun(runId); finish(new Error('Greeting timed out')); }, 45_000);
    const cwd = path.join(os.tmpdir(), 'ally-greeting');
    fs.mkdirSync(cwd, { recursive: true });
    void startAgentRun({
      provider, model, cwd, permission: 'readonly', ephemeral: true,
      prompt: 'Write one short, natural greeting for the empty input field of Ally, a chat app. You choose the wording. Maximum 9 words. Return ONLY the greeting as plain text. Do not use tools, inspect files, ask questions about setup, or explain your answer.',
    }, (_, event) => {
      if (event.kind === 'text') text += event.text;
      if (event.kind === 'done') finish(event.isError ? new Error(event.error ?? 'Agent unavailable') : undefined);
    }, binary).then(id => { runId = id; if (settled) stopAgentRun(id); }).catch(error => finish(error));
  });
  pending.set(key, request);
  void request.finally(() => pending.delete(key)).catch(() => {});
  return request;
}
