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
test('prose waits for quoting and a restarted drawing cannot mix two programs',()=>{
  const chunks=[];const relay=nativeProgramRelay(s=>chunks.push(s),spokenProgram);
  relay.update('A plain answer.');assert.deepEqual(chunks,[]);relay.finish('A plain answer.');assert.match(chunks.join(''),/say\("A plain answer\."\)/);
  const drawing=nativeProgramRelay(()=>{},s=>s);drawing.update('```js\nstep(1);\n');assert.throws(()=>drawing.update(''),/restarted/);
});
