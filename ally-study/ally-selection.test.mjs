import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {AllySelection} from './ally-selection.mjs';
import {readNativeEvents,nativeProgramRelay} from './ally-stream.mjs';

test('a desktop-issued target cannot drift to a newer native selection and is not saved over it',async()=>{
  const calls=[], selection=new AllySelection({file:path.join(os.tmpdir(),'nonexistent-ally-selection-'+crypto.randomUUID()),configFile:'unused'});
  selection.selected={chatId:'codex:new',provider:'codex',sessionId:'new',permission:'full'};
  selection.request=async(route,options)=>{calls.push({route,body:options?.body});if(route==='messages')return{id:'turn'};return{status:'done',reply:{text:'answer'}};};
  const target={chatId:'claude:original',provider:'claude',sessionId:'original',permission:'readonly'};
  const result=await selection.continue({words:'Explain the selection',context:'{}',target});
  assert.equal(calls[0].body.chatId,'claude:original');assert.equal(calls[0].body.provider,'claude');assert.equal(calls[0].body.permission,'readonly');
  assert.equal(selection.selected.chatId,'codex:new');assert.equal(result.provider,'claude');
});

async function fixture(t, handler) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-stream-deadline-'));
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const configFile=path.join(root,'bridge.json');
  fs.writeFileSync(configFile,JSON.stringify({enabled:true,port:server.address().port,token:'synthetic-test-only'}));
  t.after(()=>{server.closeAllConnections();server.close();fs.rmSync(root,{recursive:true,force:true});});
  return new AllySelection({file:path.join(root,'selection.json'),configFile,requestTimeoutMs:100});
}

test('speech/drawing streams survive the request deadline and emit progressive code without replay',async t=>{
  const first='```javascript\nstep(1); say("A disk");\n';
  const final=first+'circle(200,200,30);\n```';
  const selection=await fixture(t,async(_req,res)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write(`data: ${JSON.stringify({type:'text',text:first})}\n\n`);
    await delay(250);
    if(res.destroyed)return;
    res.end(`data: ${JSON.stringify({type:'text',text:final.slice(first.length)})}\n\ndata: ${JSON.stringify({type:'done',text:final})}\n\n`);
  });
  const response=await selection.request('turns/existing/events',{raw:true});
  const chunks=[],relay=nativeProgramRelay(part=>chunks.push(part),value=>value);
  const answer=await readNativeEvents(response,{onText:value=>relay.update(value)});
  relay.finish(answer);
  assert.equal(chunks[0],first);
  assert.equal(chunks.join(''),final);
  assert.equal(answer,final);
});

test('an open stream still cancels immediately when the user stops it',async t=>{
  const selection=await fixture(t,(_req,res)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream'});res.flushHeaders();
  });
  const controller=new AbortController();
  const response=await selection.request('turns/existing/events',{raw:true,signal:controller.signal});
  const pending=readNativeEvents(response,{signal:controller.signal});
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
});

test('connection establishment and stalled JSON bodies still time out',async t=>{
  const selection=await fixture(t,(req,res)=>{
    if(req.url.includes('json')){res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();}
  });
  await assert.rejects(selection.request('events',{raw:true}),{name:'TimeoutError'});
  await assert.rejects(selection.request('json'),{name:'TimeoutError'});
});
