import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeEvents,nativeProgramRelay} from './ally-stream.mjs';
import {nativeReplyProgram} from './ally-native-turn.mjs';
import {spokenProgram} from './ally-selection.mjs';
import {createRequire} from 'node:module';
const {parse}=createRequire(new URL('../glass-pip-chat/package.json',import.meta.url))('acorn');
function stream(events,split=1) {
  const bytes=new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
  return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=split)controller.enqueue(bytes.slice(i,i+split));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});
}
test('native events survive byte-split UTF-8 and deliver progress before completion',async()=>{
  const progress=[];
  const answer=await readNativeEvents(stream([{type:'snapshot',text:'Hello '},{type:'text',text:'📚漢字'},{type:'done',text:'Hello 📚漢字'}]),{onText:text=>progress.push(text)});
  assert.deepEqual(progress,['Hello ','Hello 📚漢字']);assert.equal(answer,'Hello 📚漢字');
});
test('disconnects and bridge errors cannot become an empty successful response',async()=>{
  await assert.rejects(readNativeEvents(stream([{type:'snapshot',text:'partial'}])),/disconnected/);
  await assert.rejects(readNativeEvents(stream([{type:'error',error:'Stopped by you'}])),/Stopped by you/);
});
test('reset replaces cumulative agent text before any native output',async()=>{
  const progress=[];
  await readNativeEvents(stream([{type:'text',text:'Draft'},{type:'reset'},{type:'text',text:'Revised'},{type:'done',text:'Revised'}],13),{onText:text=>progress.push(text)});
  assert.deepEqual(progress,['Draft','','Revised']);
});
test('cancellation closes the native stream instead of polling or starting another run',async()=>{
  const controller=new AbortController();let cancelled=false;
  const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
  const pending=readNativeEvents(response,{signal:controller.signal});controller.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(cancelled,true);
});
test('native drawing begins on its first program lines and is never replayed on completion',()=>{
  const chunks=[];const relay=nativeProgramRelay(s=>chunks.push(s),s=>nativeReplyProgram(s,parse,spokenProgram));
  relay.update('```java');assert.equal(chunks.length,0);
  const first='```javascript\nstep(0); say("Hello");\n';relay.update(first);assert.equal(chunks.join(''),first);
  const complete=first+'circle(20,30,4);\n```';relay.update(complete);relay.finish(complete);
  assert.equal(chunks.join(''),complete);
});
test('completed prose speaks before completion and a restarted drawing cannot mix two programs',()=>{
  const chunks=[];const relay=nativeProgramRelay(s=>chunks.push(s),s=>nativeReplyProgram(s,parse,spokenProgram));
  relay.update('A plain answer. ');assert.match(chunks.join(''),/say\("A plain answer\."\)/);relay.finish('A plain answer. ');
  assert.equal((chunks.join('').match(/A plain answer/g)||[]).length,1);
  const drawing=nativeProgramRelay(()=>{},s=>s);drawing.update('```js\nstep(1);\n');assert.throws(()=>drawing.update(''),/restarted/);
});

test('tutorial blocks and reference-tool commentary stream as one growing program before completion',()=>{
  const chunks=[],relay=nativeProgramRelay(s=>chunks.push(s),s=>nativeReplyProgram(s,parse,spokenProgram));
  let response='I checked the native graph reference.\n\n```js\nstep(1); say("First beat");\n';
  relay.update(response);
  assert.match(chunks.join(''),/say\("First beat"\)/);
  assert.ok(chunks.join('').includes('checked'));
  for(const tail of ['`','`','`','\n\nNext beat:\n```java','script\nstep(2); say("Second beat");\n','```']) {
    response+=tail;relay.update(response);
  }
  assert.ok(chunks.join('').includes('Second beat'));
  assert.equal((chunks.join('').match(/First beat/g)||[]).length,1);
  relay.finish(response);
  assert.equal(chunks.join(''),'```javascript\nstep(0); say("I checked the native graph reference.");\nstep(1); say("First beat");\nstep(0); say("Next beat:");\nstep(2); say("Second beat");\n```');
});

import {nativeSpeechRate,nativeSpeechConfig} from './ally-stream.mjs';
test('native speed controls actual synthesis as well as caption timing',()=>{
 for(const speed of [0.75,1,1.5]) {
  const c=nativeSpeechConfig('en-AU-Chirp3-HD-Aoede',speed);
  assert.equal(c.streamingAudioConfig.speakingRate,speed);
  assert.equal(c.streamingAudioConfig.sampleRateHertz,24000);
 }
 for(const invalid of [undefined,null,'0.75',NaN,Infinity]) assert.equal(nativeSpeechRate(invalid),1);
 assert.equal(nativeSpeechRate(-1),0.25);assert.equal(nativeSpeechRate(9),2);
});
