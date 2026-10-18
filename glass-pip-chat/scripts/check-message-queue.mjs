// Isolated software QA: real Electron renderer/IPC, synthetic queue, no agents or device connection.
import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = process.cwd();
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-queue-native-'));
app.setPath('userData', userData);
const waitFor = async test => {
  for(let n=0;n<100;n++) { if(await test()) return; await new Promise(resolve=>setTimeout(resolve,50)); }
  throw Error('Native queue QA timed out');
};
async function run() {
  await app.whenReady();
  const { MessageQueue } = await import(pathToFileURL(path.join(root,'dist/electron/agent/messageQueue.js')).href);
  const q = new MessageQueue(); q.configure(path.join(userData,'queue.json'));
  q.enqueue('codex:synthetic',{id:'one',text:'First queued message'});
  q.enqueue('codex:synthetic',{id:'two',text:'Explain this diagram after the current response, keeping the same conversation.',attachments:[{name:'diagram.png'}]});
  q.enqueue('codex:synthetic',{id:'three',text:'This message can be canceled before sending.'});
  const delivered=[]; q.register('codex:synthetic',async item=>{delivered.push(item.text)});
  ipcMain.handle('qa:queue',(_,key)=>q.snapshot(key));
  ipcMain.handle('qa:change',(_,key,action)=>q.change(key,action));
  const fixture=fs.mkdtempSync(path.join(root,'.queue-qa-'));
  fs.writeFileSync(path.join(fixture,'index.html'),'<html class="dark"><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
  fs.writeFileSync(path.join(fixture,'main.tsx'),`import React from 'react'; import {createRoot} from 'react-dom/client'; import Queue from '../src/components/chat/MessageQueueStack'; import '../src/styles/index.css'; document.body.style.cssText='margin:0;background:#181a21;color:#eee'; createRoot(document.getElementById('root')!).render(<div style={{padding:12}}><Queue chatId="codex:synthetic" /></div>);`);
  await build({configFile:false,root:fixture,base:'./',plugins:[react()],logLevel:'error',build:{outDir:'out',rollupOptions:{input:path.join(fixture,'index.html')}}});
  const preload=path.join(fixture,'preload.cjs');
  fs.writeFileSync(preload,"const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('pip',{agent:{queue:key=>ipcRenderer.invoke('qa:queue',key),queueChange:(key,action)=>ipcRenderer.invoke('qa:change',key,action)}});");
  const window=new BrowserWindow({width:360,height:600,show:false,webPreferences:{preload,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  await window.loadFile(path.join(fixture,'out/index.html'));
  const js=source=>window.webContents.executeJavaScript(source);
  await waitFor(()=>js("document.body.textContent.includes('First queued message')"));
  window.showInactive();
  await new Promise(resolve=>setTimeout(resolve,250));
  const overflow=await js('document.documentElement.scrollWidth > innerWidth');
  if(overflow) throw Error('Queue overflows the 360px viewport');
  fs.writeFileSync(path.join(userData,'queue.png'),(await window.webContents.capturePage()).toPNG());
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Edit').click()");
  await js("const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Edited before sending');field.dispatchEvent(new Event('input',{bubbles:true}));");
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Save').click()");
  await waitFor(()=>q.snapshot('codex:synthetic').items[0].text==='Edited before sending');
  await js("document.querySelector('[aria-label=\"Drag queued message 2\"]').dispatchEvent(new DragEvent('dragstart',{bubbles:true}))");
  await js("document.querySelector('li').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true}))");
  await waitFor(()=>q.snapshot('codex:synthetic').items[0].id==='two');
  await waitFor(()=>js("document.querySelector('li').textContent.includes('Explain this diagram')"));
  await js("[...document.querySelectorAll('button')].filter(b=>b.textContent==='Cancel').at(-1).click()");
  await waitFor(()=>q.snapshot('codex:synthetic').items.length===2);
  await waitFor(()=>js("[...document.querySelectorAll('button')].filter(b=>b.textContent==='Cancel').length===2"));
  await js("[...document.querySelectorAll('button')].find(b=>b.textContent==='Send now').click()");
  await waitFor(()=>delivered.length===1 && q.snapshot('codex:synthetic').items.length===1);
  if(!delivered[0].startsWith('Explain this diagram')) throw Error('Wrong reordered item delivered');
  window.destroy();
  console.log('PASS native queue: real renderer + IPC, edit, drag reorder, cancel, send now, 360px fit. Synthetic preview: '+path.join(userData,'queue.png'));
  app.quit();
}
void run().catch(error=>{ console.error(error); app.exit(1); });
