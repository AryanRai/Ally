import fs from 'node:fs';
import path from 'node:path';
import { CONTINUE_PROMPT } from './codexCycle.js';
import { isUsageLimitInfo } from './codexEvents.js';
import type { AgentEvent } from './types.js';

/**
 * Chats you run in the Codex app use only its own login, so a usage limit stops them even when
 * another Ally account is free. This watches for that stop and continues the same chat through
 * Ally, which moves it to the next available account. Ally's own turns are skipped: codexCycle
 * already handles them.
 */

/** Ally's own Codex turns, by thread: last time Ally started or observed one. */
const allyTurns = new Map<string, number>();
export function markAllyCodexTurn(threadId: string | undefined, now = Date.now()) {
  if (!threadId) return;
  allyTurns.set(threadId, now);
  if (allyTurns.size > 500) allyTurns.delete(allyTurns.keys().next().value!);
}

export interface LimitedTurn { threadId: string; turnId: string; cwd: string; title: string; prompt: string }
export interface CodexAppLimitDeps {
  /** Newest turn plus thread metadata, through the read-only history API. */
  latest(threadId: string): Promise<{ turn?: any; cwd?: string; title?: string } | undefined>;
  /** Continues the chat through Ally's runner; resolves with the run's final event. */
  continueChat(turn: LimitedTurn): Promise<Extract<AgentEvent, { kind: 'done' }>>;
  autoSwitch(): boolean;
  /** The Codex app runs on the original login; record that it is limited. */
  markDefaultLimited(): void;
  notify(id: string, title: string, text: string, threadId: string, cwd: string): void;
  handled: { has(turnId: string): boolean; add(turnId: string): void };
  now?: () => number;
}

/** Only turns this recent are continued; older stops were seen and left by the user. */
const RECENT_MS = 15 * 60_000;
/** While the Codex app still holds the chat, retry this often, a limited number of times. */
const HELD_RETRY_MS = 60_000, HELD_RETRIES = 15;
const AMBIENT = /<in-app-browser-context[\s\S]*?<\/in-app-browser-context>\s*(?:## My request:\s*)?/g;

/** What to send: a continuation if the reply was cut off, or the same message if it never ran. */
export function continuationFor(turn: any): string | undefined {
  const items: any[] = Array.isArray(turn?.items) ? turn.items : [];
  const ran = items.some(item => item?.type !== 'userMessage');
  if (ran) return CONTINUE_PROMPT;
  const message = items.find(item => item?.type === 'userMessage');
  const content: any[] = Array.isArray(message?.content) ? message.content : [];
  // Images or files cannot be resent faithfully from history; leave those to the user.
  if (!content.length || content.some(part => part?.type !== 'text')) return undefined;
  const text = content.map(part => String(part.text ?? '')).join('\n').replace(AMBIENT, '').trim();
  return text || undefined;
}

const heldByCodex = (error: string | undefined) => /open in Codex|active writer|desktop owner|ownership conflict/i.test(error ?? '');

export function createCodexAppLimitWatcher(deps: CodexAppLimitDeps) {
  const now = deps.now ?? Date.now;
  const active = new Set<string>();
  const retries = new Map<string, ReturnType<typeof setTimeout>>();

  /** `retrying` is the one turn a held retry may continue again. */
  async function check(threadId: string, attempt = 0, retrying?: string): Promise<void> {
    if (active.has(threadId) || !deps.autoSwitch()) return;
    active.add(threadId);
    try {
      const latest = await deps.latest(threadId);
      const turn = latest?.turn;
      if (!turn?.id || turn.status !== 'failed' || !isUsageLimitInfo(turn.error?.codexErrorInfo)) return;
      if (retrying ? turn.id !== retrying : deps.handled.has(turn.id)) return;
      const ended = Number(turn.completedAt ?? turn.startedAt) * (Number(turn.completedAt ?? turn.startedAt) < 1e12 ? 1000 : 1);
      if (!retrying && (!Number.isFinite(ended) || now() - ended > RECENT_MS)) return;
      // Ally sent this turn (or is handling the chat): codexCycle already moved it.
      const started = Number(turn.startedAt) * (Number(turn.startedAt) < 1e12 ? 1000 : 1);
      const ally = allyTurns.get(threadId);
      if (!retrying && ally !== undefined && ally >= (Number.isFinite(started) ? started : ended) - 5000) return;
      const prompt = continuationFor(turn);
      const title = latest?.title || 'Codex chat';
      const cwd = latest?.cwd || '';
      if (!prompt) {
        deps.handled.add(turn.id);
        deps.notify(`codex-app-limit-${turn.id}`, title, 'This Codex chat hit a usage limit. Its message had attachments, so continue it from Ally yourself.', threadId, cwd);
        return;
      }
      deps.handled.add(turn.id);
      deps.markDefaultLimited();
      markAllyCodexTurn(threadId, now());
      const done = await deps.continueChat({ threadId, turnId: turn.id, cwd, title, prompt });
      if (!done.isError) {
        deps.notify(`codex-app-limit-${turn.id}`, title, 'Codex ran out of usage here, so Ally continued this chat on another of your accounts.', threadId, cwd);
      } else if (heldByCodex(done.error) && done.delivery === 'not_sent' && attempt < HELD_RETRIES) {
        // Nothing was sent; try again once the Codex app lets go of the chat.
        if (attempt === 0) deps.notify(`codex-app-limit-held-${turn.id}`, title, 'This chat hit a usage limit in Codex. Switch to another chat in Codex and Ally will continue it on another account.', threadId, cwd);
        retries.set(threadId, setTimeout(() => { retries.delete(threadId); void check(threadId, attempt + 1, turn.id); }, HELD_RETRY_MS));
      } else if (/usage limit/i.test(done.error ?? '')) {
        deps.notify(`codex-app-limit-all-${turn.id}`, title, 'All your Codex accounts have reached their usage limits. This chat stays paused until one resets.', threadId, cwd);
      }
    } catch { /* Observation only; never retried blindly. */ }
    finally { active.delete(threadId); }
  }

  return {
    check,
    stop() { retries.forEach(clearTimeout); retries.clear(); },
  };
}

/** Session file names start with the thread id; only that id is read from them. */
export function threadIdFromSessionFile(name: string): string | undefined {
  return /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_[0-9a-f-]{36})?\.jsonl$/i.exec(path.basename(name))?.[1];
}

/** Watches the shared Codex history folder; contents are read only through the history API. */
export function watchCodexAppLimits(sessionsDir: string, deps: CodexAppLimitDeps): () => void {
  const watcher = createCodexAppLimitWatcher(deps);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let fsWatcher: fs.FSWatcher | undefined;
  try {
    fsWatcher = fs.watch(sessionsDir, { recursive: true }, (_, name) => {
      const threadId = name ? threadIdFromSessionFile(String(name)) : undefined;
      if (!threadId) return;
      clearTimeout(timers.get(threadId));
      // A finished turn writes several lines; check once it settles.
      timers.set(threadId, setTimeout(() => { timers.delete(threadId); void watcher.check(threadId); }, 3000));
    });
    fsWatcher.on('error', () => fsWatcher?.close());
  } catch { /* No history folder yet: nothing to watch. */ }
  return () => { fsWatcher?.close(); timers.forEach(clearTimeout); watcher.stop(); };
}
