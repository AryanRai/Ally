import { expect, it } from 'vitest';
import { prepareStudySession, registerStudySession, StudyCues } from './studySession';
import { TutorModel } from './model';
import type { TutorBoard } from './types';

it('stages rich cards without advancing them until their actual spoken cue', () => {
  const cues = new StudyCues(), model = new TutorModel();
  const board: TutorBoard = { id: 'board', chatId: 'chat', presentation: 'study', displayId: 1, bounds: { x: 0, y: 0, width: 1000, height: 800 }, capturedAt: 1, steps: [], sketches: [], selected: 0, following: true, sketching: false, frozen: false, revision: 0 };
  model.start(board);
  for (const [id, cue] of [['one','Here is the input.'],['two','Now change the frequency.']]) {
    model.draw('board', { id, title: id, explanation: cue, marks: [], diagram: { html: '<svg/><input type="range">', height: 300 } });
    expect(cues.stage(id, cue)).toBeUndefined();
  }
  expect(model.get()?.selected).toBe(0);
  expect(cues.hear('Unrelated speech')).toBeUndefined();
  expect(cues.hear('Now change the frequency!')).toBe('two');
  model.activate('board', 'two'); expect(model.get()?.selected).toBe(1);
  model.select('board','previous');
  model.activate('board','two'); expect(model.get()?.selected).toBe(0); // Manual review takes priority.
  cues.reset(); expect(cues.hear('Now change the frequency.')).toBeUndefined();
});
it('reveals an incrementally built card when its cue arrived before its next update', () => {
  const cues = new StudyCues();
  expect(cues.hear('The highlighted signal is delayed.')).toBeUndefined();
  expect(cues.stage('signal','The highlighted signal is delayed.')).toBe('signal');
});
it('registers a single presentation adapter without starting an agent', async () => {
  expect(await prepareStudySession({ chatId:'a', sessionKey:'a', context:'{}' })).toBe('');
  const stop = registerStudySession(async input => `board for ${input.sessionKey}`);
  expect(await prepareStudySession({chatId:'a',sessionKey:'codex:original',context:'{}'})).toBe('board for codex:original');
  stop(); expect(await prepareStudySession({chatId:'a',sessionKey:'a',context:'{}'})).toBe('');
});
