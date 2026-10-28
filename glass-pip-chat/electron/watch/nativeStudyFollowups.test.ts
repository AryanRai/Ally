// @vitest-environment node
import { expect, it } from 'vitest';
import { NATIVE_STUDY_FOLLOWUPS_REFERENCE } from './nativeStudyFollowups';

it('documents same-chat ask buttons and the engine sound names, not the tour-only pills',()=>{
  const {api,example}=NATIVE_STUDY_FOLLOWUPS_REFERENCE;
  expect(api).toContain('button(x,y,text,{ask:words})');
  expect(api).toContain('same chat');
  expect(api).toContain('welcome-tour only');
  for(const name of ['ding','nope','stamp','tada','sparkle','whoosh','boing'])expect(api).toContain(`'${name}'`);
  expect(api).toContain('drawing-sound setting');
  expect(example).toContain('step(1)');expect(example).toContain('say(');
  expect(example.match(/button\(/g)).toHaveLength(3);
  expect(example.match(/sfx\(/g)).toHaveLength(1);
  expect(api.length+example.length).toBeLessThan(2400);
});
