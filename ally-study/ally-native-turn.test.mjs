import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {nativeImages,nativeContext,nativeReplyProgram} from './ally-native-turn.mjs';
import {AllySelection,spokenProgram} from './ally-selection.mjs';
const require=createRequire(new URL('../glass-pip-chat/package.json', import.meta.url));
const {parse}=require('acorn');
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
const capture={base64:pixel.toString('base64'),mimeType:'image/png',widthInPixels:1,heightInPixels:1};
function folder(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-native-turn-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}

test('native top-level screenshot with text live_state reaches the selected chat as an attachment',async t=>{
  const root=folder(t),payload={screenshot:capture,live_state:'The native live state is text',turn:{words:'Explain this image'}};
  const images=await nativeImages(payload,root);
  assert.equal(images.length,1);assert.deepEqual(fs.readFileSync(images[0]),pixel);
  const configFile=path.join(root,'bridge.json');fs.writeFileSync(configFile,JSON.stringify({enabled:true,port:18765,token:'test-only'}));
  const calls=[];
  const selection=new AllySelection({file:path.join(root,'selection.json'),configFile,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    const value=url.endsWith('/attachments')?{attachment:{id:'screen'}}:url.endsWith('/messages')?{id:'turn'}:{status:'done',reply:{text:'An image'}};
    return new Response(JSON.stringify(value));
  }});
  selection.selected={chatId:'codex:original',provider:'codex',permission:'readonly'};
  await selection.continue({words:payload.turn.words,images,context:nativeContext(payload)});
  assert.deepEqual(calls[0].options.body,pixel);assert.equal(calls[0].options.headers['Content-Type'],'image/png');
  const sent=JSON.parse(calls[1].options.body);
  assert.deepEqual(sent.attachments,['screen']);assert.equal(sent.chatId,'codex:original');assert.equal(sent.presentation,'native-study');
  assert.ok(sent.context.includes('The native live state is text'));assert.ok(!sent.context.includes(capture.base64));
});

test('keeps primary capture, attached images and every other screen, and rejects malformed images',async t=>{
  const root=folder(t);
  assert.equal((await nativeImages({screenshot:capture,attached_images:[capture,capture],other_screens:[capture,capture,capture]},root)).length,6);
  assert.equal((await nativeImages({live_state:{screenshot:capture}},root)).length,1);
  await assert.rejects(nativeImages({screenshot:{...capture,base64:'not an image!'}},root),/Capture it again/);
  assert.equal((await nativeImages({live_state:'screenless'},root)).length,0);
});

test('preserves drawing and speech programs without executing them; plain answers are safely quoted',()=>{
  const drawing='```javascript\nstep(0); say("A circle"); circle(200,200,60,{tone:"blue"});\n```';
  assert.equal(nativeReplyProgram(drawing,parse,spokenProgram),drawing);
  assert.match(nativeReplyProgram('Normal prose',parse,spokenProgram),/say\("Normal prose"\)/);
  assert.throws(()=>nativeReplyProgram('```js\ninvalid ???\n```',parse,spokenProgram));
  assert.ok(nativeContext({live_state:'A'.repeat(200000)}).length<=32000);
});

test('reads captures nested in turn, as the native client writes them, and keeps data URLs out of the prompt',async t=>{
  const root=folder(t);
  const body={turn:{words:'What is this?',live_state:'text',screenshot:capture,attached_images:[capture],other_screens:[capture]},
    thread:[{type:'message',role:'user',content:[{type:'input_image',image_url:`data:image/jpeg;base64,${capture.base64}`},{type:'input_text',text:'earlier'}]}]};
  assert.equal((await nativeImages(body,root)).length,3);
  const context=nativeContext(body);
  assert.ok(!context.includes(capture.base64));assert.ok(context.includes('[image]'));assert.ok(context.includes('earlier'));
});
