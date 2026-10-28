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
it('retains spoken cues for late rendering and clears them for the next turn',()=>{
 const cues=new StudyCues();
 cues.hear('Watch the car and its attached parts move together.');
 cues.hear('Now the car body changes colour.');
 expect(cues.stage('car','Watch the car and its attached parts move together.')).toBe('car');
 expect(cues.stage('colour','Now the car body changes colour.')).toBe('colour');
 cues.reset();expect(cues.stage('car','Watch the car and its attached parts move together.')).toBeUndefined();
});
it('reads the real native caption JSON, ignoring chips and decoding escapes',()=>{
 const cues=new StudyCues();cues.stage('wave','Watch the rotating arrow trace a sine wave.');
 expect(cues.hear(JSON.stringify({header:'Step 2',text:'Watch the rotating arrow trace a sine wave.',chips:Array.from({length:40},()=>({label:'waiting','state':'waiting'}))}))).toBe('wave');
 cues.stage('escape',"Let’s move the car.");
 expect(cues.hear('{"text":"Let\\u2019s move the car.","chips":[]}')).toBe('escape');
 expect(cues.hear('{"header":"Watch the rotating arrow trace a sine wave.","chips":[]}')).toBeUndefined();
});
