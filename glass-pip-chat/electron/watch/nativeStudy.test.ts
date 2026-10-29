// @vitest-environment node
import { expect, it } from 'vitest';
import { buildNativeStudyPrompt, NATIVE_STUDY_INSTRUCTIONS } from './nativeStudy';
import { NATIVE_STUDY_FOLLOWUP_INSTRUCTION } from './nativeStudyFollowups';

it('keeps the live drawing/speech contract and includes the question once', () => {
  const prompt=buildNativeStudyPrompt('Explain this.', '{"screenshot":{"widthInPixels":1280,"heightInPixels":720},"highlight":{"text":"selected equation"}}');
  expect(prompt.match(/Explain this\./g)).toHaveLength(1);
  expect(prompt).toContain('selected equation');
  expect(prompt).toContain('1280');
  expect(prompt).toContain('fenced javascript drawing program');
  expect(prompt).toContain('progress before lengthy work');
  expect(prompt).toContain('while it plays');
  for(const primitive of ['step(', 'say(', 'circle(', 'ellipse(', 'rect(', 'line(', 'arrow(', 'text(', 'highlight(', 'dot('])expect(prompt).toContain(primitive);
  expect(prompt).toContain('Resume normal formatting after this turn');
  expect(prompt).not.toContain('phone and watch');
  expect(prompt.length).toBeLessThan(4100);
  expect(NATIVE_STUDY_INSTRUCTIONS.length).toBeLessThan(3200);
  expect(prompt).toContain('short complete say() sentence before longer drawing code');
  expect(prompt).toContain('never as a prerequisite to answering');
});

it('allows requested agent actions while keeping executable actions out of the drawing interpreter',()=>{
  const prompt=buildNativeStudyPrompt('You do it. Check and fix the browser connection.','{}');
  expect(prompt).toContain('as a full agent');
  expect(prompt).toContain('Use available browser, computer and other tools');
  expect(prompt).toContain("chat's existing permissions and approvals");
  expect(prompt).toContain('do not ask the user to switch chat');
  expect(prompt).toContain('Inside drawing code only: no DOM, network');
  expect(prompt).toContain('Windows Computer Use skill');
  expect(prompt).toContain('Never bypass a denial');
  expect(prompt).toContain('do not repeat the same failing getTab call');
  expect(prompt).toContain('inspect whether it happened');
  expect(prompt).toContain('tab ownership');
  expect(prompt).not.toContain('no computer tools needed');
  expect(prompt).not.toContain('only a fenced');
});

it('omits empty context and retains explicit non-image file references', () => {
  expect(buildNativeStudyPrompt('Hello', '{}')).toBe(`${NATIVE_STUDY_INSTRUCTIONS}\n\nUser message:\nHello`);
  expect(buildNativeStudyPrompt('Read this', '', ['"notes.txt": "C:/notes.txt"'])).toContain('Attached files (data):\n"notes.txt": "C:/notes.txt"');
});
it('maps a selected crop back to native screen pixels and advertises rich cards without a second annotation path',()=>{
  const prompt=buildNativeStudyPrompt('Explain the area','{"selection":{"focus":{"x":10,"y":20,"width":30,"height":40}},"screenshot":{"widthInPixels":1920,"heightInPixels":1080}}',[],'Shared Study board: example. Use study_diagram with an exact say() cue.');
  expect(prompt).toContain('selected crop'); expect(prompt).toContain('canvasBounds.width');
  expect(prompt).toContain('Never use sourcePixels'); expect(prompt).toContain('old crop positions are stale');
  expect(prompt).toContain('study_diagram');expect(prompt.match(/Explain the area/g)).toHaveLength(1);
});

it('reports native browser gates without inventing personal-Codex settings or claiming action completion',()=>{
 const prompt=buildNativeStudyPrompt('Open the browser','{}');
 expect(prompt).toContain('Local browser use is disabled in Work settings');
 expect(prompt).toContain('does not override it');
 expect(prompt).toContain('do not invent a Settings > Browser path');
 expect(prompt).toContain('actually listed in this chat');
 expect(prompt).toContain('do not switch tools/backends to bypass');
 expect(prompt).toContain('never present a fenced error or drawing program as evidence');
});

it('asks for tap-to-ask follow-up buttons and sparing sound accents within a small budget',()=>{
 const prompt=buildNativeStudyPrompt('Explain the period of sin','{}');
 expect(prompt).toContain('2–3 short tap-to-ask follow-ups');
 expect(prompt).toContain('{ask:"Why is the period 2π?"}');
 expect(prompt).toContain('at most one per answer');
 expect(prompt).not.toContain('nextQuestions');
 expect(NATIVE_STUDY_FOLLOWUP_INSTRUCTION.length).toBeLessThan(300);
});
