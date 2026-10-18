// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { InterruptedSessions } from './interrupted';

it('persists Stop across restart, isolates sessions and invalidates only newer user input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-interrupted-'));
  try {
    const first = new InterruptedSessions(), restarted = new InterruptedSessions();
    const file = path.join(dir, 'state.json'); first.configure(file);
    first.stopped('codex:original'); first.stopped('claude:other');
    const receipt = first.read('codex:original')!;
    restarted.configure(file); expect(restarted.read('codex:original')).toEqual(receipt);
    expect(() => restarted.starting('codex:original', 'old-token')).toThrow('changed');
    restarted.observe('codex:original', receipt.stoppedAt - 1);
    expect(restarted.read('codex:original')).toEqual(receipt);
    restarted.starting('codex:original', receipt.token);
    expect(restarted.read('codex:original')).toBeUndefined();
    expect(restarted.read('claude:other')).toBeTruthy();
    restarted.observe('claude:other', Date.now() + 1);
    expect(restarted.read('claude:other')).toBeUndefined();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
