import { expect, it } from 'vitest';
import { compactInteractions } from './compactInteractions';
import type { InteractionHistory } from '../../electron/devices/interactions';

const row = (id: string, closedAt: number, state: InteractionHistory['state'] = 'answered') => ({ id, state, closedAt, expiresAt: 200000 }) as InteractionHistory;
it('keeps only the latest closed request within one minute and the current exchange', () => {
  expect(compactInteractions([row('old', 100), row('previous-question', 95000), row('recent', 99000), row('newest', 99900)], 98000, 100000).map(r => r.id)).toEqual(['newest']);
  expect(compactInteractions([row('old', 100)], 0, 100000)).toEqual([]);
  expect(compactInteractions([row('last-question', 99000)], 99500, 100000)).toEqual([]);
});
it('always keeps genuinely pending requests even if older than the current question, without closed clutter', () => {
  const pending = row('pending', 0, 'pending');
  expect(compactInteractions([row('just-done', 99999), pending, pending], 99000, 100000)).toEqual([pending]);
  expect(compactInteractions([{ ...pending, expiresAt: 100000 }], 0, 100000)).toEqual([]);
});
