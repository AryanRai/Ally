import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {AllySelection,spokenProgram} from './ally-selection.mjs';
import {allowedBridgeRoute,createNotchHandler} from './ally-notch.mjs';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
function fixture(t,fetchImpl) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-notch-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const configFile=path.join(root,'bridge.json'),file=path.join(root,'profile','selection.json');
  fs.writeFileSync(configFile,JSON.stringify({enabled:true,port:18765,token:'server-secret'}));
  let shared={version:'initial',selected:null},lastChat;
  const wrapped=async(url,options)=>{
    if(url.endsWith('/selection')) {
      if(options.method==='POST') {
        const input=JSON.parse(options.body);
        if(input.version!==shared.version)return response({...shared,accepted:false});
        shared={version:crypto.randomUUID(),selected:{chatId:input.chatId,provider:input.provider,title:lastChat?.title,permission:input.permission}};
        return response({...shared,accepted:true});
      }
      return response(shared);
    }
    const result=await fetchImpl(url,options);
    const value=await result.clone().json();if(value.chat)lastChat=value.chat;
    return result;
  };
  return {root,configFile,file,share:selected=>{shared={version:crypto.randomUUID(),selected};},selection:new AllySelection({file,configFile,fetchImpl:wrapped,pollMs:1})};
}
const selected={chatId:'codex:original',provider:'codex',permission:'readonly'};

test('usage proxy requires the native capability and keeps the desktop token server-side',async t=>{
  let calls=0;
  const fetchImpl=async(url,options)=>{
    calls++;assert.ok(url.endsWith('/v1/usage'));assert.equal(options.headers.Authorization,'Bearer server-secret');
    assert.equal(options.headers.Origin,undefined);return response({codex:{windows:[]}});
  };
  const f=fixture(t,fetchImpl);
  const handler=createNotchHandler({...f,fetchImpl,capability:'native-only'});
  const server=http.createServer(async(req,res)=>{await handler(req,res,new URL(req.url,'http://localhost'));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}/notch-api/v1/usage`;
  assert.equal((await fetch(base)).status,401);assert.equal(calls,0);
  const result=await fetch(base,{headers:{Authorization:'Bearer native-only'}});
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{codex:{windows:[]}});assert.equal(calls,1);
  assert.equal(allowedBridgeRoute('POST','/v1/usage'),false);
});

test('selected canonical chat and permission survive reopening and backend restart',async t=>{
  const f=fixture(t,async()=>response({chat:{id:'canonical',provider:'codex',title:'Study'}}));
  await f.selection.select(selected);
  const restored=new AllySelection({...f,fetchImpl:()=>{throw Error('Browsing must not send');}});
  assert.deepEqual(restored.snapshot(),{selected:{chatId:'canonical',provider:'codex',title:'Study',permission:'readonly'},activeTurn:null});
});
test('wrong engine and invalid permission cannot replace selected chat',async t=>{
  const f=fixture(t,async()=>response({chat:{id:'chat',provider:'claude'}}));
  await assert.rejects(f.selection.select(selected),/engine/);
  await assert.rejects(f.selection.select({...selected,permission:'unknown'}),/Invalid/);
  assert.equal(f.selection.selected,null);assert.equal(fs.existsSync(f.file),false);
});

test('desktop selection and clearing propagate to the collapsed notch',async t=>{
  const f=fixture(t,async()=>response({}));
  f.share({...selected,title:'Desktop choice'});
  assert.equal((await f.selection.refresh()).selected.title,'Desktop choice');
  f.share(null);assert.equal((await f.selection.refresh()).selected,null);
  assert.equal(new AllySelection({...f}).selected,null);
});

test('a slow notch history read cannot replace a newer desktop choice',async t=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const f=fixture(t,async()=>{await pending;return response({chat:{id:'old',provider:'codex',title:'Old'}});});
  const choosing=f.selection.select(selected);
  await new Promise(resolve=>setImmediate(resolve));
  f.share({...selected,chatId:'codex:newer',title:'Newer'});release();
  const result=await choosing;
  assert.equal(result.conflict,true);assert.equal(result.selected.chatId,'codex:newer');assert.equal(result.history,undefined);
});
test('collapsed-notch send targets selected chat and never switches an in-flight request',async t=>{
  const calls=[];let polls=0;
  const f=fixture(t,async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/messages'))return response({id:'turn1'});
    if(url.includes('/turns/'))return response(++polls===1?{status:'thinking',approvals:[{id:'real-approval'}]}:{status:'done',reply:{text:'Answer'}});
    return response({chat:{id:'other',provider:'claude',title:'Other'}});
  });
  f.selection.selected={...selected};
  const answer=await f.selection.continue({words:'Keep explaining',onTurn:()=>{f.selection.selected={chatId:'other',provider:'claude',permission:'edit'};}});
  const sent=JSON.parse(calls[0].options.body);
  assert.equal(sent.chatId,'codex:original');assert.equal(sent.provider,'codex');assert.equal(sent.permission,'readonly');assert.equal(sent.text,'Keep explaining');
  assert.deepEqual(answer,{text:'Answer',provider:'codex'});assert.equal(f.selection.activeTurn,null);
  assert.equal(calls.filter(c=>c.url.endsWith('/messages')).length,1);
});
test('bridge errors do not create or fall back to another conversation',async t=>{
  const calls=[];const f=fixture(t,async url=>{calls.push(url);return response({error:'Owned by original app'},409);});
  f.selection.selected=selected;
  await assert.rejects(f.selection.continue({words:'Hello'}),/Owned by original/);
  assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/messages'));assert.equal(f.selection.continuing,false);
});
test('a cancelled native request stops only its own bridge turn',async t=>{
  const controller=new AbortController();const calls=[];
  const f=fixture(t,async(url,options)=>{calls.push(url);if(url.endsWith('/messages'))return response({id:'turn1'});
    if(url.endsWith('/stop'))return response({stopped:true});
    controller.abort();return response({status:'thinking'});
  });f.selection.selected=selected;
  await assert.rejects(f.selection.continue({words:'Hello',signal:controller.signal}),{name:'AbortError'});
  assert.ok(calls.at(-1).endsWith('/turns/turn1/stop'));assert.equal(f.selection.activeTurn,null);
});
test('simultaneous native requests cannot submit two turns while awaiting an upload',async t=>{
  let release;const blocked=new Promise(resolve=>{release=resolve;});
  const f=fixture(t,async url=>{await blocked;return url.endsWith('/messages')?response({id:'turn1'}):response({status:'done',reply:{text:'Done'}});});
  f.selection.selected=selected;
  const pending=f.selection.continue({words:'First'});
  await assert.rejects(f.selection.continue({words:'Second'}),/already responding/);
  release();await pending;
});
test('speech wrapper quotes model text and bounds individual speech chunks',()=>{
  const text='\" ); process.exit(); //\n'+'A'.repeat(8000)+'📚漢字'.repeat(2000);
  const output=spokenProgram(text);
  const chunks=[...output.matchAll(/say\((.*)\);/g)].map(m=>JSON.parse(m[1]));
  assert.equal(chunks.join(''),text);assert.ok(chunks.every(s=>s.length<=2800 && Buffer.byteLength(s)<=4000));
});

test('proxy allows only explicit chat routes',()=>{
  for(const [method,route] of [['GET','/v1/chats'],['GET','/v1/greeting'],['POST','/v1/messages'],['POST','/v1/turns/t/approvals/a'],['POST','/v1/chats/a/stop'],['POST','/v1/attachments'],['GET','/v1/attachments/'+'a'.repeat(64)]])assert.equal(allowedBridgeRoute(method,route),true);
  for(const [method,route] of [['DELETE','/v1/chats/a'],['POST','/v1/settings'],['GET','/v1/chats/a/anything'],['GET','/v1/attachments/../../private']])assert.equal(allowedBridgeRoute(method,route),false);
});
async function serverFixture(t,fetchImpl) {
  const f=fixture(t,fetchImpl);const handler=createNotchHandler({...f,capability:'browser-capability',fetchImpl});
  const server=http.createServer(async(req,res)=>{if(!await handler(req,res,new URL(req.url,'http://localhost'))) {res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {...f,base:`http://127.0.0.1:${server.address().port}`};
}
test('proxy authenticates browser separately and never exposes bridge token or forwards Origin',async t=>{
  const calls=[];const f=await serverFixture(t,async(url,options)=>{calls.push({url,options});return response({chats:[]});});
  const denied=await fetch(f.base+'/notch-api/v1/chats');assert.equal(denied.status,401);assert.equal(calls.length,0);
  const allowed=await fetch(f.base+'/notch-api/v1/chats?provider=codex',{headers:{Authorization:'Bearer browser-capability',Origin:f.base}});
  assert.equal(allowed.status,200);assert.equal(calls[0].options.headers.Authorization,'Bearer server-secret');assert.equal(calls[0].options.headers.Origin,undefined);
  assert.equal((await allowed.text()).includes('server-secret'),false);
});
test('static host denies traversal and applies a local-only content policy',async t=>{
  const f=await serverFixture(t,()=>{throw Error('Must not call bridge');});
  fs.mkdirSync(path.join(f.root,'notch-dist'));fs.writeFileSync(path.join(f.root,'notch-dist','index.html'),'<div>Ally</div>');
  fs.writeFileSync(path.join(f.root,'secret.txt'),'private');
  const traversal=await fetch(f.base+'/notch/%2e%2e%2fsecret.txt');assert.equal(traversal.status,404);
  const page=await fetch(f.base+'/notch/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);assert.match(await page.text(),/Ally/);
});

test('notch attachment uploads preserve bytes and media headers while credentials stay server-side',async t=>{
  const calls=[],id='a'.repeat(64),png=Buffer.from('89504e470d0a1a0a','hex');
  const f=await serverFixture(t,async(url,options)=>{
    calls.push({url,options});
    return options.method==='POST'?response({attachment:{id,name:'screen.png'}}):new Response(png,{headers:{'Content-Type':'image/png'}});
  });
  const auth={Authorization:'Bearer browser-capability'};
  const uploaded=await fetch(f.base+'/notch-api/v1/attachments',{method:'POST',headers:{...auth,'Content-Type':'image/png','x-ally-filename':'screen.png'},body:png});
  assert.equal(uploaded.status,200);assert.equal((await uploaded.json()).attachment.id,id);
  assert.deepEqual(calls[0].options.body,png);assert.equal(calls[0].options.headers['Content-Type'],'image/png');assert.equal(calls[0].options.headers['x-ally-filename'],'screen.png');
  const downloaded=await fetch(f.base+'/notch-api/v1/attachments/'+id,{headers:auth});assert.equal(downloaded.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png);
  assert.equal((await fetch(f.base+'/notch-api/v1/attachments/'+id)).status,401);
});
