import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../glass-pip-chat/package.json', import.meta.url));
const WebSocket=require('ws');
const base='http://127.0.0.1:18783';
const headers={Authorization:'Bearer synthetic-local-smoke','Content-Type':'application/json'};
async function post(p,b){const r=await fetch(base+p,{method:'POST',headers,body:JSON.stringify(b)});if(!r.ok)throw Error(`${p}: ${r.status} ${await r.text()}`);return r.json();}
async function voice(){
 const m=await post('/agent/realtime/session',{});const chunks=[];
 await new Promise((resolve,reject)=>{
  const ws=new WebSocket('ws://127.0.0.1:18783/voice/realtime?model=ally-google-speech',{headers:{Authorization:'Bearer '+m.client_secret.value}});
  const timer=setTimeout(()=>{ws.terminate();reject(Error('Voice timeout'));},60000);
  ws.on('error',reject);
  ws.on('open',()=>ws.send(JSON.stringify({type:'response.create',response:{metadata:{clicky_line:'synthetic-smoke'},input:[{content:[{type:'input_text',text:JSON.stringify({response_text:'The diagram shows a circle and an arrow.'})}]}]}})));
  ws.on('message',b=>{const e=JSON.parse(b);if(e.type==='response.output_audio.delta')chunks.push(Buffer.from(e.delta,'base64'));if(e.type==='error'){clearTimeout(timer);ws.close();reject(Error(e.error.message));}if(e.type==='response.done'){clearTimeout(timer);ws.close();e.response.status==='completed'?resolve():reject(Error('Speech failed'));}});
 });
 const pcm=Buffer.concat(chunks);assert(pcm.length>24000,'No synthesized PCM');
 const t=await post('/v2/dictation/deepgram-token',{});let transcript='';
 await new Promise((resolve,reject)=>{
  const ws=new WebSocket('ws://127.0.0.1:18783/voice/listen?sample_rate=24000',{headers:{Authorization:'Bearer '+t.access_token}});
  const timer=setTimeout(()=>{ws.terminate();reject(Error('Transcription timeout'));},60000);ws.on('error',reject);
  ws.on('open',()=>{for(let i=0;i<pcm.length;i+=12000)ws.send(pcm.subarray(i,i+12000));ws.send(JSON.stringify({type:'CloseStream'}));});
  ws.on('message',b=>{const e=JSON.parse(b);if(e.type==='Results'&&e.is_final)transcript+=' '+e.channel.alternatives[0].transcript;if(e.type==='Error'){clearTimeout(timer);ws.close();reject(Error(e.description));}});
  ws.on('close',()=>{clearTimeout(timer);resolve();});
 });assert.match(transcript,/circle/i);assert.match(transcript,/arrow/i);
 return {test:'speech roundtrip',audioBytes:pcm.length,transcript:transcript.trim(),microphoneUsed:false,audioPlayed:false};
}
async function brain(){
 const r=await fetch(base+'/brain/turn',{method:'POST',headers,body:JSON.stringify({session_id:'synthetic-smoke-'+Date.now(),turn:{words:'Reply with a very short explanation of a circle. Draw one circle at (200,200). This is a synthetic integration test.'},thread:[],live_state:{}})});
 const text=await r.text();assert.equal(r.status,200,text);const events=text.split('\n').filter(s=>s.startsWith('data: ')).map(s=>JSON.parse(s.slice(6)));
 const failure=events.find(e=>e.type==='error');assert(!failure,failure?.message);assert(events.some(e=>e.type==='done'));
 const program=events.filter(e=>e.type==='text').map(e=>e.text).join('');assert.match(program,/say\(/);assert.match(program,/circle\(/);
 return {test:'Codex to Ally stream',completed:true,programCharacters:program.length};
}
const tests=process.argv.includes('--speech-only')?[voice]:process.argv.includes('--model-only')?[brain]:[voice,brain];
const results=await Promise.allSettled(tests.map(f=>f()));for(const r of results)console.log(JSON.stringify(r.status==='fulfilled'?r.value:{error:r.reason.message}));
process.exitCode=results.some(r=>r.status==='rejected')?1:0;
