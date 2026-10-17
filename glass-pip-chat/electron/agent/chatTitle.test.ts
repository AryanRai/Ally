import { expect, it } from 'vitest';
import { chatTitle } from './chatTitle';
it('uses the human message for device chat names and keeps normal titles', () => {
  expect(chatTitle('You are Ally on a round smartwatch. Instructions\n\nUser message:\nDroid Core\nprogress')).toBe('Droid Core progress');
  expect(chatTitle('You are Ally on a round smartwatch. Truncated')).toBe('Ally chat');
  expect(chatTitle('My named chat')).toBe('My named chat');
});
