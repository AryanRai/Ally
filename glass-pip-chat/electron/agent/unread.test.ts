import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UnreadStore } from './unread';
describe('shared unread receipts', () => {
  it('marks completion once, isolates providers and refuses stale acknowledgements', () => {
    const s = new UnreadStore();
    expect(s.get('codex:a').unread).toBe(false);
    const a = s.complete('codex:a', 'turn-1');
    expect(s.complete('codex:a', 'turn-1')).toEqual(a);
    expect(s.get('claude:a').unread).toBe(false);
    const b = s.complete('codex:a', 'turn-2');
    expect(s.read(a.key, a.revision)).toBe(false);
    expect(s.get(a.key).unread).toBe(true);
    expect(s.read(b.key, b.revision)).toBe(true);
    expect(s.get(a.key).unread).toBe(false);
  });
  it('persists read/unread across reconnects and desktop restarts', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ally-unread-'));
    try {
      const file = path.join(dir, 'state.json'); const s = new UnreadStore(file);
      const a = s.complete('claude:a', 'turn');
      expect(new UnreadStore(file).get(a.key)).toEqual(a);
      s.read(a.key, a.revision);
      expect(new UnreadStore(file).get(a.key).unread).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('invalidates an earlier receipt for each new native unread signal', () => {
    const s = new UnreadStore();
    const first = s.native('codex:a', true);
    expect(s.native('codex:a', true).revision).not.toBe(first.revision);
    expect(s.read(first.key, first.revision)).toBe(false);
    s.native('codex:a', false); expect(s.get(first.key).unread).toBe(false);
    expect(s.native('codex:a', true).revision).not.toBe(first.revision);
  });
  it('does not reopen a read native reply when the same snapshot is seeded after restart', () => {
    const s = new UnreadStore(); const state = s.snapshot('codex:a', true, 'turn-1');
    s.read(state.key, state.revision);
    expect(s.snapshot('codex:a', true, 'turn-1').unread).toBe(false);
    expect(s.snapshot('codex:a', true, 'turn-2').unread).toBe(true);
  });
  it('persists external running candidates for completion after a reconnect', () => {
    const s = new UnreadStore(); s.track('claude:a');
    expect(s.tracked()).toEqual(['claude:a']); expect(s.get('claude:a').unread).toBe(false);
    s.complete('claude:a', 'reply'); expect(s.tracked()).toEqual([]);
  });

});
