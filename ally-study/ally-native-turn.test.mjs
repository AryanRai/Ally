import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {nativeImages,nativeContext,nativeSelectionContext,nativeReplyProgram,nativeSelectionInput} from './ally-native-turn.mjs';
import {AllySelection,spokenProgram} from './ally-selection.mjs';

test('oversized selected context preserves complete native scene ownership and geometry',()=>{
  const scene={version:1,boardId:'bridge-scene',revision:6,groups:{car:[2,3,4]},objects:[{id:'m2',geometry:{text:'Weight = mg'}}]};
  const drawing='prior marks '.repeat(3500)+'\nEditable native scene (data): '+JSON.stringify(scene);
  const context=JSON.parse(nativeContext({turn:{drawing_on_screen:drawing,highlight:{text:'unrelated '.repeat(3000)}}},{includeHistory:false}));
  assert.deepEqual(context.native_scene,scene);
  assert.equal(context.contextTruncated,true);
  assert.ok(context.drawing_on_screen.length<=1200);
});
const require=createRequire(new URL('../glass-pip-chat/package.json', import.meta.url));
const {parse}=require('acorn');
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
const capture={base64:pixel.toString('base64'),mimeType:'image/png',widthInPixels:1,heightInPixels:1};
function folder(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-native-turn-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}

test('Circle crop uses the native canvas size, never full-resolution capture or desktop origin',()=>{
  const body={turn:{screenshot:{widthInPixels:1280,heightInPixels:720}}};
  for(const bounds of [{x:3840,y:1095,width:1920,height:1080},{x:-1536,y:-200,width:1536,height:864}]){
    const input={imagePath:'crop.png',context:{screenshot:{widthInPixels:3840,heightInPixels:2160},selection:{bounds,sourcePixels:{width:3840,height:2160},focus:{x:250,y:200,width:500,height:400}}}};
    const result=JSON.parse(nativeSelectionContext(body,input));
    assert.deepEqual(result.screenshot,{widthInPixels:1280,heightInPixels:720});
    assert.deepEqual(result.selection.canvasBounds,{x:320,y:144,width:640,height:288});
    assert.deepEqual(result.selection.bounds,bounds);
  }
  assert.throws(()=>nativeSelectionContext({}, {imagePath:'crop.png',context:{}}),/canvas is unavailable/);
  assert.equal(nativeSelectionContext(body,null),nativeContext(body,{includeHistory:false}));
});

test('desktop selection handoff is one-use and retains the original target and exact crop',async t=>{
  const root=folder(t),directory=path.join(root,'profile','study-inputs');fs.mkdirSync(directory,{recursive:true});
  const id='12345678-1234-1234-1234-123456789abc',imagePath=path.join(root,'crop.png');fs.writeFileSync(imagePath,pixel);
  const value={id,expires:2000,words:'Explain the crop',imagePath,selected:{chatId:'codex:original',provider:'codex',sessionId:'original',permission:'readonly'},context:{diagramBoardId:'board'}};
  fs.writeFileSync(path.join(directory,id+'.json'),JSON.stringify(value));fs.writeFileSync(path.join(directory,id+'.input'),'native wire');
  assert.deepEqual(await nativeSelectionInput({trigger:'ally-selection:'+id},root,1000),value);
  assert.equal(fs.existsSync(path.join(directory,id+'.input')),false);
  await assert.rejects(nativeSelectionInput({trigger:'ally-selection:'+id},root,1000),/already submitted/);
  assert.equal(await nativeSelectionInput({trigger:'hotkey'},root),null);
  await assert.rejects(nativeSelectionInput({trigger:'ally-selection:../../escape'},root),/Invalid/);
  fs.writeFileSync(path.join(directory,id+'.json'),JSON.stringify({...value,expires:1}));
  await assert.rejects(nativeSelectionInput({trigger:'ally-selection:'+id},root,1000),/expired/);
});

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

test('selected real chats receive current screen context without replaying unrelated native history',()=>{
  const body={turn:{words:'Draw and explain',screenshot:capture,highlight:{text:'current selected equation'},drawing_on_screen:'current circle'},
    thread:[{role:'user',content:'old browser setup '.repeat(3000)}]};
  const context=nativeContext(body,{includeHistory:false});
  assert.ok(context.includes('current selected equation'));
  assert.ok(context.includes('current circle'));
  assert.ok(context.includes('widthInPixels'));
  assert.ok(!context.includes('old browser setup'));
  assert.ok(!context.includes(capture.base64));
  assert.ok(context.length<1000);
  assert.ok(nativeContext(body).includes('old browser setup'));
});

test('selected Study context keeps visual references and removes legacy setup and duplicate metadata',()=>{
  const body={turn:{words:'Explain this.',front_app:'Codex',front_app_bundle_id:'com.openai.chat',fact:'',page:null,
    highlight:{gesture:'circled center',text:'selected equation'},drawing_on_screen:'blue arrow',
    live_state:'[Your jobs] sessions_spawn; [Your plan] Free; install Chrome extension',
    stable_note:'repeated highlight',time_label:'03:12',input:'voice',audio_seconds:3.28,trigger:'voice',
    screenshot:capture,attached_images:[capture],other_screens:[{...capture,widthInPixels:1920,heightInPixels:1080}]},
    live_state:'legacy top-level setup',thread:[{content:'old history'}]};
  assert.deepEqual(JSON.parse(nativeContext(body,{includeHistory:false})),{
    front_app:'Codex',highlight:{gesture:'circled center',text:'selected equation'},drawing_on_screen:'blue arrow',
    screenshot:{widthInPixels:1,heightInPixels:1},attached_images:[{widthInPixels:1,heightInPixels:1}],
    other_screens:[{widthInPixels:1920,heightInPixels:1080}]
  });
  assert.equal(nativeContext({turn:{words:'Hello',fact:'',page:null}},{includeHistory:false}),'{}');
  assert.ok(nativeContext(body).includes('sessions_spawn'));
});
