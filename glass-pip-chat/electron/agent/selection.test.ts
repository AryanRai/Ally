// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { ChatSelection } from './selection';
const target = { chatId: 'codex:original', provider: 'codex' as const, sessionId: 'original', title: 'Study', permission: 'readonly' as const };

it('shares exact selections and prevents a delayed read from replacing a newer choice', () => {
  const store = new ChatSelection(), changed = vi.fn();
  store.subscribe(changed);
  const before = store.snapshot();
  const first = store.set(target, before.version, 'notch');
  expect(first).toMatchObject({ accepted: true, selected: target, origin: 'notch' });
  const second = store.set({ ...target, sessionId: 'next', chatId: 'codex:next' }, first.version, 'desktop');
  expect(store.set(target, first.version, 'notch')).toMatchObject({ accepted: false, version: second.version, selected: { sessionId: 'next' } });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(store.set(second.selected, second.version, 'notch').version).toBe(second.version);
});

it('protects its snapshot from mutation and accepts clearing navigation without submitting anything', () => {
  const store = new ChatSelection();
  store.set(target, store.snapshot().version, 'desktop');
  store.snapshot().selected!.sessionId = 'wrong';
  expect(store.snapshot().selected?.sessionId).toBe('original');
  expect(store.set(null, store.snapshot().version, 'desktop').selected).toBe(null);
  expect(() => store.set({ ...target, provider: 'bad' } as any, store.snapshot().version, 'notch')).toThrow('Invalid');
});
