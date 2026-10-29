import { mkdtempSync as mkdtempSharedHome } from 'node:fs';
import { tmpdir as tmpdirSharedHome } from 'node:os';
import { join as joinSharedHome } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountWindows, CodexAccounts, codexProfileEnvironment, loginCodexProfile, providerReportsLimit, useCodexProfile, sharedCodexHome, shareCodexHistory } from './codexAccounts';
// ALLY_TEST_SHARED_HOME: profiles link their history here, never into the real ~/.codex.
process.env.CODEX_HOME = mkdtempSharedHome(joinSharedHome(tmpdirSharedHome(), 'ally-shared-codex-home-'));

const roots: string[] = [];
function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-profile-test-')); roots.push(root);
  const file = path.join(root, 'accounts.json'); const accounts = new CodexAccounts(); accounts.configure(file);
  return { accounts, file, root };
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('Codex account isolation and durable affinity', () => {
  it('rejects a junction alias of the same home before touching history',()=>{
    const {root}=store(),home=path.join(root,'home'),alias=path.join(root,'alias');
    fs.mkdirSync(path.join(home,'sessions'),{recursive:true});fs.writeFileSync(path.join(home,'sessions','kept.jsonl'),'kept');
    fs.symlinkSync(home,alias,'junction');
    expect(()=>shareCodexHistory(alias,home)).toThrow('directory alias');
    expect(fs.lstatSync(path.join(home,'sessions')).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(home,'sessions','kept.jsonl'),'utf8')).toBe('kept');
    fs.unlinkSync(alias);
  });
  it('rejects a self history destination before touching existing history', () => {
    const { root } = store();
    const sessions = path.join(root, 'sessions'); fs.mkdirSync(sessions);
    fs.writeFileSync(path.join(sessions, 'retained.jsonl'), 'history');
    expect(() => shareCodexHistory(root, root)).toThrow('own shared history');
    expect(fs.lstatSync(sessions).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(sessions, 'retained.jsonl'), 'utf8')).toBe('history');
  });
  it('does not inherit an Ally account profile as the shared home', () => {
    const previous = process.env.CODEX_HOME;
    try {
      process.env.CODEX_HOME = path.join(os.tmpdir(), 'codex-profiles', '4e7a74c5-440d-40e5-8ae7-f0e8aa95745f');
      expect(sharedCodexHome()).toBe(path.join(os.homedir(), '.codex'));
    } finally { if (previous === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous; }
  });
  it('persists three profiles, selection and exact-thread ownership across reload', () => {
    const { accounts, file } = store();
    const a = accounts.add('Personal'), b = accounts.add('Work'), c = accounts.add('Third');
    accounts.select(b.id); accounts.bind('native-thread', a.id);
    const reload = new CodexAccounts(); reload.configure(file);
    expect(reload.route()).toBe(b.id);
    expect(reload.route('native-thread')).toBe(a.id);
    expect(reload.route('old-unclassified-thread')).toBe('default');
    expect(reload.list().map(p => p.label)).toEqual(['Existing Codex login', 'Personal', 'Work', 'Third']);
    expect(reload.home(c.id)).not.toBe(reload.home(a.id));
    // History is shared, so a chat can move to another account and keeps it afterwards.
    expect(reload.route('native-thread', b.id)).toBe(b.id);
    reload.bind('native-thread', b.id);
    expect(reload.route('native-thread')).toBe(b.id);
  });
  it('rejects missing profiles and keeps referenced profiles and credentials intact', () => {
    const { accounts } = store(); const a = accounts.add('One'); accounts.bind('thread', a.id);
    expect(() => accounts.remove(a.id)).toThrow('Keep profiles');
    expect(() => accounts.route(undefined, '../auth')).toThrow('unavailable');
    const b = accounts.add('Unused'); const home = accounts.home(b.id)!;
    fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(path.join(home, 'sentinel'), 'retained');
    accounts.remove(b.id); expect(fs.readFileSync(path.join(home, 'sentinel'), 'utf8')).toBe('retained');
  });
  it('pins the verified identity and fails closed on corrupt metadata', () => {
    const { accounts, file } = store(); const a = accounts.add('One');
    accounts.verifyIdentity(a.id, 'one@example.test'); accounts.verifyIdentity(a.id, 'ONE@example.test');
    expect(() => accounts.verifyIdentity(a.id, 'two@example.test')).toThrow('different account');
    fs.writeFileSync(file, '{broken');
    expect(() => new CodexAccounts().configure(file)).toThrow('Cannot read');
  });
  it('isolates credentials in CODEX_HOME, shares the databases, and removes alternate inherited credentials without mutating the parent', () => {
    const base = { HOME: '/real', USERPROFILE: 'C:/real', APPDATA: 'C:/real/AppData', LOCALAPPDATA: 'C:/real/Local', PATH: 'tools', OPENAI_API_KEY: 'test-only', CODEX_ACCESS_TOKEN: 'test-only', OPENAI_IDENTITY_TOKEN_FILE: 'test-only', codex_home: '/other', CODEX_SQLITE_HOME: '/elsewhere' };
    const env = codexProfileEnvironment(base, '/owned/profile', '/real/.codex');
    // One shared database keeps every account on the same copy of each chat.
    expect(env).toEqual({ HOME: base.HOME, USERPROFILE: base.USERPROFILE, APPDATA: base.APPDATA, LOCALAPPDATA: base.LOCALAPPDATA, PATH: 'tools', CODEX_HOME: '/owned/profile', CODEX_SQLITE_HOME: '/real/.codex' });
    expect(base.OPENAI_API_KEY).toBe('test-only');
  });
  it('never invents reset times and persists a limit observation across reload without rotating selection', () => {
    const { accounts, file } = store(); const a = accounts.add('One'); accounts.select(a.id); accounts.limited(a.id);
    const reload = new CodexAccounts(); reload.configure(file);
    expect(reload.snapshot().selected).toBe(a.id);
    expect(reload.snapshot().status[a.id]).toMatchObject({ state: 'limited', windows: [] });
    expect(accountWindows({ rateLimits: { primary: { usedPercent: 100, resetsAt: 123 } } })).toEqual([{ name: 'Codex primary', usedPercent: 100, resetsAt: 123000 }]);
    expect(accountWindows({ rateLimits: { primary: { usedPercent: NaN } } })).toEqual([]);
  });
  it('prevents login racing active turns and prevents sends during login', () => {
    const release = useCodexProfile('lock-test');
    expect(() => loginCodexProfile('lock-test')).toThrow('active replies'); release(); release();
    const done = loginCodexProfile('lock-test');
    try { expect(() => useCodexProfile('lock-test')).toThrow('sign-in'); expect(() => loginCodexProfile('other')).toThrow(); }
    finally { done(); }
    useCodexProfile('lock-test')();
  });
  it('frees a limited account once its exhausted window resets, ignoring unexhausted windows', () => {
    const { accounts } = store();
    const a = accounts.add('A'), b = accounts.add('B'), c = accounts.add('C');
    const now = 1_000_000_000, hour = 3_600_000;
    // 5-hour window hit and since reset; weekly window not exhausted.
    accounts.observe({ id: a.id, state: 'limited', checkedAt: now - 3 * hour, windows: [
      { name: 'primary', usedPercent: 100, resetsAt: now - hour }, { name: 'secondary', usedPercent: 63, resetsAt: now + 100 * hour }] });
    // Weekly window genuinely exhausted.
    accounts.observe({ id: b.id, state: 'limited', checkedAt: now - hour, windows: [
      { name: 'primary', usedPercent: 74, resetsAt: now + hour }, { name: 'secondary', usedPercent: 100, resetsAt: now + 100 * hour }] });
    // Limit hit again after the recorded reset: stale windows, so the retry period applies.
    accounts.observe({ id: c.id, state: 'limited', checkedAt: now - 5 * 60_000, windows: [
      { name: 'primary', usedPercent: 100, resetsAt: now - hour }] });
    expect(accounts.available(a.id, now)).toBe(true);
    expect(accounts.available(b.id, now)).toBe(false);
    expect(accounts.available(c.id, now)).toBe(false);
    expect(accounts.available(c.id, now + hour)).toBe(true);
    expect(accounts.next(new Set(['default']), now)).toBe(a.id);
  });
});

it('does not turn a percentage or unrelated model bucket into a definite rejection', () => {
  expect(providerReportsLimit({ rateLimits: { primary: { usedPercent: 100 } } })).toBe(false);
  expect(providerReportsLimit({ rateLimitsByLimitId: { other: { rateLimitReachedType: 'usageLimit' } } })).toBe(false);
  expect(providerReportsLimit({ rateLimits: { rateLimitReachedType: 'usageLimit' } })).toBe(true);
});
