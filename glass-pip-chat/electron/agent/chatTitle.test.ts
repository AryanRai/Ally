import { expect, it } from 'vitest';
import { chatTitle } from './chatTitle';
import { WATCH_INSTRUCTIONS } from '../watch/protocol';
it('uses the human message for device chat names and keeps normal titles', () => {
  expect(chatTitle('You are Ally on a round smartwatch. Instructions\n\nUser message:\nDroid Core\nprogress')).toBe('Droid Core progress');
  expect(chatTitle('You are Ally on a round smartwatch. Truncated')).toBe('Ally chat');
  expect(chatTitle('My named chat')).toBe('My named chat');
  expect(chatTitle(`${WATCH_INSTRUCTIONS}\n\nUser message:\nExplain the full design`)).toBe('Explain the full design');
  expect(chatTitle('Ally device interface. Truncated')).toBe('Ally chat');
});
