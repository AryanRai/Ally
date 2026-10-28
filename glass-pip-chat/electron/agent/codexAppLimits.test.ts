import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTINUE_PROMPT } from './codexCycle';
import { continuationFor, createCodexAppLimitWatcher, markAllyCodexTurn, threadIdFromSessionFile, type CodexAppLimitDeps } from './codexAppLimits';

const NOW = 1_800_000_000_000;
const user = (text: string) => ({ type: 'userMessage', content: [{ type: 'text', text }] });
const limited = (id: string, items: any[], ageMs = 60_000) => ({
  id, status: 'failed', items, startedAt: (NOW - ageMs - 30_000) / 1000, completedAt: (NOW - ageMs) / 1000,
  error: { message: 'You’ve hit your usage limit.', codexErrorInfo: 'usageLimitExceeded' },
});

function deps(turn: any, done: any = { kind: 'done', delivery: 'accepted' }) {
  const handled = new Set<string>();
  const d = {
    latest: vi.fn(async () => ({ turn, cwd: 'C:/work', title: 'Fix Ally' })),
    continueChat: vi.fn(async () => done),
    autoSwitch: vi.fn(() => true),
    markDefaultLimited: vi.fn(),
    notify: vi.fn(),
    handled: { has: (id: string) => handled.has(id), add: (id: string) => { handled.add(id); } },
    now: () => NOW,
  } satisfies CodexAppLimitDeps;
  return d;
}

afterEach(() => vi.useRealTimers());

describe('continuing Codex app chats stopped by a usage limit', () => {
  it('continues a reply cut off part-way, once, and records the original login as limited', async () => {
    const d = deps(limited('turn-1', [user('fix it'), { type: 'agentMessage' }]));
    const watcher = createCodexAppLimitWatcher(d);
    await watcher.check('thread-a'); await watcher.check('thread-a');
    expect(d.continueChat).toHaveBeenCalledTimes(1);
    expect(d.continueChat).toHaveBeenCalledWith({ threadId: 'thread-a', turnId: 'turn-1', cwd: 'C:/work', title: 'Fix Ally', prompt: CONTINUE_PROMPT });
    expect(d.markDefaultLimited).toHaveBeenCalled();
    expect(d.notify).toHaveBeenCalledWith('codex-app-limit-turn-1', 'Fix Ally', expect.stringContaining('continued'), 'thread-a', 'C:/work');
  });

  it('resends a message refused before it ran, without the Codex app\'s ambient context', () => {
    const text = '\n<in-app-browser-context source="ambient-ui-state">\nstate\n</in-app-browser-context>\n\n## My request:\ndidnt we already do this?\n';
    expect(continuationFor({ items: [user(text)] })).toBe('didnt we already do this?');
    expect(continuationFor({ items: [{ type: 'userMessage', content: [{ type: 'text', text: 'look' }, { type: 'localImage', path: 'a.png' }] }] })).toBeUndefined();
  });

  it('leaves a message with attachments to the user', async () => {
    const d = deps(limited('turn-2', [{ type: 'userMessage', content: [{ type: 'localImage', path: 'a.png' }] }]));
    await createCodexAppLimitWatcher(d).check('thread-b');
    expect(d.continueChat).not.toHaveBeenCalled();
    expect(d.notify).toHaveBeenCalledWith(expect.any(String), 'Fix Ally', expect.stringContaining('attachments'), 'thread-b', 'C:/work');
  });

  it.each([
    ['a completed turn', { ...limited('t', [user('x')]), status: 'completed', error: null }],
    ['another failure', { ...limited('t', [user('x')]), error: { message: 'boom', codexErrorInfo: 'other' } }],
    ['an old stop', limited('t', [user('x')], 60 * 60_000)],
  ])('ignores %s', async (_name, turn) => {
    const d = deps(turn);
    await createCodexAppLimitWatcher(d).check('thread-c');
    expect(d.continueChat).not.toHaveBeenCalled();
  });

  it('does nothing when automatic switching is off', async () => {
    const d = deps(limited('t', [user('x')]));
    d.autoSwitch.mockReturnValue(false);
    await createCodexAppLimitWatcher(d).check('thread-d');
    expect(d.latest).not.toHaveBeenCalled();
  });

  it('leaves Ally\'s own turns to account cycling', async () => {
    const d = deps(limited('t', [user('x')]));
    markAllyCodexTurn('thread-ally', NOW - 80_000);
    await createCodexAppLimitWatcher(d).check('thread-ally');
    expect(d.continueChat).not.toHaveBeenCalled();
  });

  it('retries while the Codex app holds the chat, and stops if you continue it yourself', async () => {
    vi.useFakeTimers();
    const d = deps(limited('turn-h', [user('x'), { type: 'agentMessage' }]), { kind: 'done', delivery: 'not_sent', isError: true, error: 'This chat is open in Codex. Your message was not sent.' });
    const watcher = createCodexAppLimitWatcher(d);
    await watcher.check('thread-h');
    expect(d.notify).toHaveBeenCalledWith('codex-app-limit-held-turn-h', 'Fix Ally', expect.stringContaining('Switch to another chat'), 'thread-h', 'C:/work');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.continueChat).toHaveBeenCalledTimes(2);
    d.latest.mockResolvedValue({ turn: { id: 'newer', status: 'completed' }, cwd: 'C:/work', title: 'Fix Ally' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.continueChat).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it('says so when every account is limited', async () => {
    const d = deps(limited('turn-x', [user('x'), { type: 'agentMessage' }]), { kind: 'done', delivery: 'not_sent', isError: true, usageLimit: true, error: 'This Codex account has reached its usage limit.' });
    await createCodexAppLimitWatcher(d).check('thread-x');
    expect(d.notify).toHaveBeenCalledWith('codex-app-limit-all-turn-x', 'Fix Ally', expect.stringContaining('All your Codex accounts'), 'thread-x', 'C:/work');
  });

  it('reads only the thread id from a session file name', () => {
    expect(threadIdFromSessionFile('2026/10/28/rollout-2026-10-28T16-47-57-01a1810d-0694-7b52-9ed8-d41939c0db74.jsonl')).toBe('01a1810d-0694-7b52-9ed8-d41939c0db74');
    expect(threadIdFromSessionFile('rollout-2026-10-28T18-56-00-019ff712-a519-7cb0-b941-ed3be6c60d05_01a18182-44e0-7582-b4bc-330755c2a6c8.jsonl')).toBe('019ff712-a519-7cb0-b941-ed3be6c60d05');
    expect(threadIdFromSessionFile('state.sqlite')).toBeUndefined();
  });
});
