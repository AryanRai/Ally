import { mkdtempSync as mkdtempSharedHome } from 'node:fs';
import { tmpdir as tmpdirSharedHome } from 'node:os';
import { join as joinSharedHome } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountWindows, CodexAccounts, codexProfileEnvironment, loginCodexProfile, providerReportsLimit, useCodexProfile } from './codexAccounts';
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
  it('isolates CODEX_HOME only and removes alternate inherited credentials without mutating the parent', () => {
    const base = { HOME: '/real', USERPROFILE: 'C:/real', APPDATA: 'C:/real/AppData', LOCALAPPDATA: 'C:/real/Local', PATH: 'tools', OPENAI_API_KEY: 'test-only', CODEX_ACCESS_TOKEN: 'test-only', OPENAI_IDENTITY_TOKEN_FILE: 'test-only', codex_home: '/other' };
    const env = codexProfileEnvironment(base, '/owned/profile');
    expect(env).toEqual({ HOME: base.HOME, USERPROFILE: base.USERPROFILE, APPDATA: base.APPDATA, LOCALAPPDATA: base.LOCALAPPDATA, PATH: 'tools', CODEX_HOME: '/owned/profile' });
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
});

it('does not turn a percentage or unrelated model bucket into a definite rejection', () => {
  expect(providerReportsLimit({ rateLimits: { primary: { usedPercent: 100 } } })).toBe(false);
  expect(providerReportsLimit({ rateLimitsByLimitId: { other: { rateLimitReachedType: 'usageLimit' } } })).toBe(false);
  expect(providerReportsLimit({ rateLimits: { rateLimitReachedType: 'usageLimit' } })).toBe(true);
});
