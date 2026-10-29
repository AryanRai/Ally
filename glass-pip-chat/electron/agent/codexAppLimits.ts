import fs from 'node:fs';
import path from 'node:path';
import { CONTINUE_PROMPT } from './codexCycle.js';
import { isUsageLimitInfo } from './codexEvents.js';
import type { AgentEvent } from './types.js';

/**
 * Keeps Codex chats going through usage limits:
 * - Chats you run in the Codex app use only its own login, so a limit stops them even when another
 *   Ally account is free. This notices that stop and continues the same chat through Ally, which
 *   moves it to the next available account.
 * - When every account is limited (for those chats, or Ally's own after codexCycle gives up), the
 *   chat waits for the first reset and then continues. Waiting chats are saved, so they survive a
 *   restart. A chat you continue yourself in the meantime is dropped.
 * Ally's own turns are otherwise left to codexCycle.
 */

/** Ally's own Codex turns, by thread: last time Ally started or observed one. */
const allyTurns = new Map<string, number>();
export function markAllyCodexTurn(threadId: string | undefined, now = Date.now()) {
  if (!threadId) return;
  allyTurns.set(threadId, now);
  if (allyTurns.size > 500) allyTurns.delete(allyTurns.keys().next().value!);
}

/** A chat to continue: `since` is when it stopped; `turnId` is the stopped turn, when history has one. */
export interface PausedChat { threadId: string; turnId?: string; cwd: string; title: string; prompt: string; since: number }

/** codexCycle reports here when every account is limited, so Ally's own chats also wait for a reset. */
let onAllLimited: ((chat: PausedChat) => void) | undefined;
export function waitForCodexReset(chat: PausedChat) { onAllLimited?.(chat); }

export interface CodexAppLimitDeps {
  /** Newest turn plus thread metadata, through the read-only history API. */
  latest(threadId: string): Promise<{ turn?: any; cwd?: string; title?: string } | undefined>;
  /** Continues the chat through Ally's runner; resolves with the run's final event. */
  continueChat(chat: PausedChat): Promise<Extract<AgentEvent, { kind: 'done' }>>;
  autoSwitch(): boolean;
  /** The Codex app runs on the original login; record that it is limited. */
  markDefaultLimited(): void;
  /** When the first limited account resets, if any account reported one. */
  nextReset(): number | undefined;
  notify(id: string, title: string, text: string, threadId: string, cwd: string): void;
  handled: { has(turnId: string): boolean; add(turnId: string): void };
  /** Chats waiting for a reset, persisted across restarts. */
  waiting: { load(): PausedChat[]; save(chats: PausedChat[]): void };
  now?: () => number;
}

/** Only stops this recent are picked up; older ones were seen and left by the user. */
const RECENT_MS = 30 * 60_000;
/** While the Codex app still holds the chat, retry this often, a limited number of times. */
const HELD_RETRY_MS = 60_000, HELD_RETRIES = 15;
/** Waiting for a reset: start a little after it, re-check at most this often, and give up after a day. */
const RESET_GRACE_MS = 60_000, RESET_FALLBACK_MS = 30 * 60_000, WAIT_LIMIT_MS = 24 * 60 * 60_000;
const AMBIENT = /<in-app-browser-context[\s\S]*?<\/in-app-browser-context>\s*(?:## My request:\s*)?/g;

const ms = (seconds: unknown) => { const n = Number(seconds); return Number.isFinite(n) ? n < 1e12 ? n * 1000 : n : NaN; };
const limitStop = (turn: any) => turn?.status === 'failed' && isUsageLimitInfo(turn.error?.codexErrorInfo);

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
  const busy = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const waiting = new Map<string, PausedChat>(deps.waiting.load().map(chat => [chat.threadId, chat]));
  const persist = () => deps.waiting.save([...waiting.values()]);
  const later = (threadId: string, delay: number, task: () => Promise<void>) => {
    clearTimeout(timers.get(threadId));
    timers.set(threadId, setTimeout(() => { timers.delete(threadId); void task(); }, Math.max(1000, delay)));
  };

  /** A newer turn that is not another limit stop means you continued the chat yourself. */
  async function stillPaused(chat: PausedChat) {
    const turn = (await deps.latest(chat.threadId))?.turn;
    return !turn || ms(turn.startedAt) <= chat.since || limitStop(turn);
  }

  function wait(chat: PausedChat, first: boolean) {
    if (now() - chat.since > WAIT_LIMIT_MS) { waiting.delete(chat.threadId); persist(); return; }
    waiting.set(chat.threadId, chat); persist();
    const reset = deps.nextReset();
    const at = reset && reset > now() ? reset + RESET_GRACE_MS : now() + RESET_FALLBACK_MS;
    if (first) {
      const time = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      deps.notify(`codex-limit-wait-${chat.threadId}-${chat.since}`, chat.title, `All your Codex accounts have reached their usage limits. Ally will continue this chat around ${time}, when one resets.`, chat.threadId, chat.cwd);
    }
    later(chat.threadId, Math.min(at - now(), RESET_FALLBACK_MS), () => resume(chat.threadId));
  }

  async function resume(threadId: string) {
    const chat = waiting.get(threadId);
    if (!chat || busy.has(threadId)) return;
    if (!deps.autoSwitch() || !await stillPaused(chat).catch(() => true)) { waiting.delete(threadId); persist(); return; }
    const reset = deps.nextReset();
    // Not reset yet: keep waiting quietly.
    if (reset && reset + RESET_GRACE_MS > now()) { wait(chat, false); return; }
    await run(chat, 0, false);
  }

  async function run(chat: PausedChat, attempt: number, firstWait = true): Promise<void> {
    busy.add(chat.threadId);
    let done: Extract<AgentEvent, { kind: 'done' }>;
    try {
      markAllyCodexTurn(chat.threadId, now());
      done = await deps.continueChat(chat);
    } catch { done = { kind: 'done', isError: true, delivery: 'not_sent', error: 'Could not start' }; }
    finally { busy.delete(chat.threadId); }
    if (!done.isError) {
      if (waiting.delete(chat.threadId)) persist();
      deps.notify(`codex-limit-continued-${chat.threadId}-${chat.since}`, chat.title, 'This chat hit a usage limit, so Ally continued it on another of your accounts.', chat.threadId, chat.cwd);
    } else if (heldByCodex(done.error) && done.delivery === 'not_sent' && attempt < HELD_RETRIES) {
      // Nothing was sent; try again once the Codex app lets go of the chat.
      if (attempt === 0) deps.notify(`codex-limit-held-${chat.threadId}-${chat.since}`, chat.title, 'This chat hit a usage limit in Codex. Switch to another chat in Codex and Ally will continue it on another account.', chat.threadId, chat.cwd);
      later(chat.threadId, HELD_RETRY_MS, async () => { if (await stillPaused(chat).catch(() => false)) await run(chat, attempt + 1, firstWait); });
    } else if ((done.usageLimit || /usage limit/i.test(done.error ?? '')) && done.delivery !== 'uncertain') {
      wait(chat, firstWait && !waiting.has(chat.threadId));
    }
  }

  /** A turn in history stopped by a limit, which Ally did not send. */
  async function check(threadId: string): Promise<void> {
    if (busy.has(threadId) || waiting.has(threadId) || !deps.autoSwitch()) return;
    busy.add(threadId);
    let chat: PausedChat | undefined;
    try {
      const latest = await deps.latest(threadId);
      const turn = latest?.turn;
      if (!turn?.id || !limitStop(turn) || deps.handled.has(turn.id)) return;
      const ended = ms(turn.completedAt ?? turn.startedAt);
      if (!Number.isFinite(ended) || now() - ended > RECENT_MS) return;
      // Ally sent this turn: codexCycle already moved it (and reports here if every account is out).
      const started = ms(turn.startedAt), ally = allyTurns.get(threadId);
      if (ally !== undefined && ally >= (Number.isFinite(started) ? started : ended) - 5000) return;
      const title = latest?.title || 'Codex chat', cwd = latest?.cwd || '';
      const prompt = continuationFor(turn);
      deps.handled.add(turn.id);
      if (!prompt) {
        deps.notify(`codex-limit-attachments-${turn.id}`, title, 'This Codex chat hit a usage limit. Its message had attachments, so continue it from Ally yourself.', threadId, cwd);
        return;
      }
      deps.markDefaultLimited();
      chat = { threadId, turnId: turn.id, cwd, title, prompt, since: ended };
    } catch { return; /* Observation only; never retried blindly. */ }
    finally { busy.delete(threadId); }
    await run(chat, 0);
  }

  onAllLimited = chat => {
    if (waiting.has(chat.threadId) || !deps.autoSwitch()) return;
    // The runner does not know the chat's title; history does.
    void deps.latest(chat.threadId).then(latest => latest?.title || 'Codex chat', () => chat.title)
      .then(title => { if (!waiting.has(chat.threadId)) wait({ ...chat, title }, true); });
  };
  // Chats saved as waiting resume on their own schedule after a restart.
  for (const chat of waiting.values()) later(chat.threadId, 5000, () => resume(chat.threadId));

  return {
    check,
    waiting: () => [...waiting.values()],
    stop() { timers.forEach(clearTimeout); timers.clear(); onAllLimited = undefined; },
  };
}

/** Session file names start with the thread id; only that id is read from them. */
export function threadIdFromSessionFile(name: string): string | undefined {
  return /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_[0-9a-f-]{36})?\.jsonl$/i.exec(path.basename(name))?.[1];
}

/** Threads whose session files changed recently: a stop while Ally was closed is still picked up. */
function recentThreads(sessionsDir: string, since: number): string[] {
  const found = new Set<string>();
  for (const back of [0, 1]) {
    const day = new Date(since - back * 24 * 60 * 60_000);
    const dir = path.join(sessionsDir, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      const id = threadIdFromSessionFile(name);
      try { if (id && fs.statSync(path.join(dir, name)).mtimeMs >= since) found.add(id); } catch { /* removed meanwhile */ }
    }
  }
  return [...found];
}

/** Watches the shared Codex history folder; contents are read only through the history API. */
export function watchCodexAppLimits(sessionsDir: string, deps: CodexAppLimitDeps): () => void {
  const watcher = createCodexAppLimitWatcher(deps);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const soon = (threadId: string, delay: number) => {
    clearTimeout(timers.get(threadId));
    // A finished turn writes several lines; check once it settles.
    timers.set(threadId, setTimeout(() => { timers.delete(threadId); void watcher.check(threadId); }, delay));
  };
  let fsWatcher: fs.FSWatcher | undefined;
  try {
    fsWatcher = fs.watch(sessionsDir, { recursive: true }, (_, name) => {
      const threadId = name ? threadIdFromSessionFile(String(name)) : undefined;
      if (threadId) soon(threadId, 3000);
    });
    fsWatcher.on('error', () => fsWatcher?.close());
  } catch { /* No history folder yet: nothing to watch. */ }
  recentThreads(sessionsDir, (deps.now ?? Date.now)() - RECENT_MS).forEach((id, i) => soon(id, 8000 + i * 1000));
  return () => { fsWatcher?.close(); timers.forEach(clearTimeout); watcher.stop(); };
}
