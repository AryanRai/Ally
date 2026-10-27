import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {nativeConversationCode} from './ally-native-conversation.mjs';
import {nativeProgramRelay} from './ally-stream.mjs';
import {nativeReplyProgram} from './ally-native-turn.mjs';
import {spokenProgram} from './ally-selection.mjs';
const {parse}=createRequire(new URL('../glass-pip-chat/package.json',import.meta.url))('acorn');
const makeRelay=delta=>nativeProgramRelay(delta,s=>nativeReplyProgram(s,parse,spokenProgram));

test('speaks completed progress before final answer or tool completion, never a partial word',()=>{
  const chunks=[],relay=makeRelay(s=>chunks.push(s));
  relay.update('I’ll build the visual ref');assert.equal(chunks.length,0);
  relay.update('I’ll build the visual reference. Then');
  assert.match(chunks.join(''),/say\("I’ll build the visual reference\."\)/);
  assert.ok(!chunks.join('').includes('Then'));
  relay.finish('I’ll build the visual reference. Then show you.');
  assert.equal((chunks.join('').match(/visual reference/g)||[]).length,1);
  assert.match(chunks.join(''),/say\("Then show you\."\)/);
});

test('a completed commentary item starts speech while the rest of the turn is still working',()=>{
  const chunks=[],relay=makeRelay(s=>chunks.push(s));
  relay.update('I’ll prepare two lookup pages.');
  relay.update('I’ll prepare two lookup pages.\n\n'); // Real Codex item completion delimiter.
  assert.match(chunks.join(''),/say\("I’ll prepare two lookup pages\."\)/);
  // No final answer, drawing or turn completion has been received.
  assert.ok(!chunks.join('').endsWith('```'));
});

test('long Unicode narration respects the voice line limit without dropping characters',()=>{
  const text='漢字📚'.repeat(1800)+'.', speech=[];
  vm.runInNewContext(nativeConversationCode(text,true),{step(){},say(text){speech.push(text);}},{timeout:1000});
  assert.equal(speech.join(''),text);
  assert.ok(speech.every(line=>Buffer.byteLength(line)<=4000&&line.length<=2800));
});

test('every streamed character keeps an append-only program across prose, fences and code',()=>{
  const raw='I’ll label it.\n\n```javascript\nstep(1); say("Look here."); circle(10,20,5);\n```\n\nHere is [the reference](https://example.test/file).\n\n~~~python\nprint("do not speak code")\n~~~\nDone.';
  const chunks=[],relay=makeRelay(s=>chunks.push(s));
  for(let i=1;i<=raw.length;i++)relay.update(raw.slice(0,i));
  relay.finish(raw);
  const code=chunks.join('');
  assert.match(code,/say\("I’ll label it\."\)/);
  assert.match(code,/circle\(10,20,5\)/);
  assert.match(code,/Here is the reference/);
  assert.ok(!code.includes('example.test')&&!code.includes('do not speak code'));
  assert.equal((code.match(/Look here/g)||[]).length,1);
});

test('progress is safely quoted, and only explicit JavaScript fences become drawing commands',()=>{
  const text='I said "); globalThis.bad=true; //".\n\n```json\n{"secret":"not spoken"}\n```\n\nReady.';
  const code=nativeConversationCode(text,true);
  parse(code,{ecmaVersion:'latest'});
  const speech=[];
  vm.runInNewContext(code,{step(){},say(text){speech.push(text);}},{timeout:1000});
  assert.equal(speech[0],'I said "); globalThis.bad=true; //".');
  assert.deepEqual(speech.slice(1),['Ready.']);
  assert.ok(!code.includes('secret'));
});

test('the actual native engine keeps progress, speech order and original drawing steps',()=>{
  const raw='I’ll prepare the page.\n\nI’m adding the labels.\n\n```js\nstep(1); say("First explanation."); circle(20,30,4);\nstep(2); say("Second explanation."); rect(50,60,30,40);\n```';
  const context=vm.createContext({console});
  vm.runInContext(fs.readFileSync(new URL('./client/Assets/Engine/clicky-draw-engine.js',import.meta.url),'utf8'),context,{timeout:5000});
  context.program=nativeConversationCode(raw,true);
  const marks=vm.runInContext('ClickyDraw.runCode(program,1280,720,{budgetMs:1000})',context,{timeout:3000});
  assert.equal(marks.error,null);
  assert.deepEqual(Array.from(marks.says,s=>s.text),['I’ll prepare the page.','I’m adding the labels.','First explanation.','Second explanation.']);
  assert.deepEqual(Array.from(marks,m=>({kind:m.do,step:m.step})),[{kind:'circle',step:1},{kind:'rect',step:2}]);
});
