// Production React meeting controls in a native window, with synthetic state only.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-meeting-ui-')); app.setPath('userData', temp);
const fixture = fs.mkdtempSync(path.join(root, '.meeting-qa-'));
fs.writeFileSync(path.join(fixture, 'index.html'), '<html class="dark"><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
fs.writeFileSync(path.join(fixture, 'main.tsx'), `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Meeting from '../src/components/perception/PerceptionBar';import '../src/styles/index.css';
const original={id:'local',title:'Design review',agent:{provider:'codex',sessionId:'exact-chat'},messages:[],createdAt:0,updatedAt:0};
function App(){const [chat,setChat]=useState(original),[session,setSession]=useState(null);window.qa={switchChat:()=>setChat({...original,title:'Other chat',agent:{provider:'claude',sessionId:'other'}}),session:()=>session};const perception={api:{start:async opts=>setSession({...opts,state:'running',startedAt:new Date().toISOString()}),pause:async()=>setSession(s=>({...s,state:'paused'})),resume:async()=>setSession(s=>({...s,state:'running'})),stop:async()=>setSession(null),setCapture:async patch=>setSession(s=>({...s,capture:{...s.capture,...patch}}))},status:{session,audio:{system_audio:'listening',microphone:'off'},screen:'watching'},turns:[],observations:[]};return <main style={{margin:12,border:'1px solid #ffffff20',borderRadius:18,overflow:'hidden',background:'#09090be8'}}><header style={{padding:'12px 14px',fontSize:13}}>● Ally <span style={{opacity:.5}}> / {chat.title}</span></header><Meeting perception={perception} chat={chat} onOpenSession={()=>setChat(original)}/><div style={{margin:10,padding:12,border:'1px solid #ffffff18',borderRadius:12,fontSize:12,opacity:.45}}>Ask anything…</div></main>};document.body.style.cssText='background:#18181b;color:#eee;margin:0';createRoot(document.getElementById('root')).render(<App/>);`);
const deadline = setTimeout(() => { console.error('FAIL meeting QA timeout'); app.exit(1); }, 90000);
const wait = async test => { for (let i=0;i<120;i++) { if(await test()) return; await new Promise(resolve=>setTimeout(resolve,40)); } throw Error('Meeting UI state timed out'); };
async function run(){try{
 await build({configFile:false,root:fixture,base:'./',plugins:[react()],resolve:{alias:{'@':path.join(root,'src')}},logLevel:'error',build:{outDir:'out',rollupOptions:{input:path.join(fixture,'index.html')}}});
 await app.whenReady();const win=new BrowserWindow({show:false,width:360,height:620,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});await win.loadFile(path.join(fixture,'out/index.html'));
 const js=source=>win.webContents.executeJavaScript(source);const click=label=>js('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+JSON.stringify(label)+').click()');
 await wait(()=>js('!!window.qa'));
 assert.equal(await js('window.qa.session()'),null);
 await click('Meeting');await wait(()=>js('document.body.textContent.includes("Start meeting")'));
 win.showInactive();
 for(const width of [320,360,640]){win.setContentSize(width,620);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');assert.equal(await js('document.documentElement.scrollWidth > innerWidth'),false);fs.writeFileSync(path.join(temp,'setup-'+width+'.png'),(await win.webContents.capturePage()).toPNG());}
 await click('Start meeting');await wait(()=>js('window.qa.session()?.state==="running"'));assert.equal(await js('window.qa.session().sessionId'),'exact-chat');
 await js('window.qa.switchChat()');await wait(()=>js('document.body.textContent.includes("Meeting stays in")'));
 win.setContentSize(360,620);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(temp,'bound-meeting.png'),(await win.webContents.capturePage()).toPNG());
 await js('document.querySelector("[aria-label=\\"Pause capture\\"]").click()');await wait(()=>js('window.qa.session()?.state==="paused"'));
 assert.equal(await js('window.qa.session().sessionId'),'exact-chat');
 await click('Design review');await wait(()=>js('!document.body.textContent.includes("Meeting stays in")'));
 await js('document.querySelector("[aria-label=\\"End meeting session\\"]").click()');await wait(()=>js('window.qa.session()===null'));
 console.log(JSON.stringify({status:'PASS',widths:[320,360,640],currentChat:true,navigationBinding:true,pauseEnd:true,noCapture:true,previews:temp}));clearTimeout(deadline);app.exit(0);
}catch(error){console.error(error.stack??error);clearTimeout(deadline);app.exit(1);}}
void run();
