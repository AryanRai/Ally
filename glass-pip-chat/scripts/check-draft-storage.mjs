// Synthetic native Chromium quota/reload regression; never sends an agent turn.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = process.cwd();
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-draft-quota-'));
app.setPath('userData', path.join(fixture, 'data'));
async function run() {
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  fs.writeFileSync(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="./main.tsx"></script>');
  fs.writeFileSync(path.join(fixture, 'main.tsx'), `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {useChatDrafts} from ${JSON.stringify(path.join(root, 'src/hooks/useChatDrafts.ts').replaceAll('\\', '/'))};
    function Fixture(){const {input,setInput}=useChatDrafts('synthetic');window.edit=setInput;return <textarea value={input} onChange={e=>setInput(e.target.value)}/>}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  `);
  await build({ configFile: false, root: fixture, plugins: [react()], base: './', logLevel: 'error', build: { outDir: 'out' } });
  await app.whenReady();
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  const js = code => win.webContents.executeJavaScript(code);
  const wait = async code => { const end = Date.now() + 10000; while (!await js(code)) { if (Date.now() > end) throw Error(code); await new Promise(r => setTimeout(r, 30)); } };
  await win.loadFile(path.join(fixture, 'out/index.html'));
  await wait('typeof edit === "function"');
  const filled = await js(`(()=>{let i=0;try{while(i<200)localStorage.setItem('synthetic-fill-'+i++,'x'.repeat(1024*1024));}catch(e){return e.name}})()`);
  assert.equal(filled, 'QuotaExceededError');
  // Consume the remaining space to make even a small draft fail.
  await js(`(()=>{for(let n=524288;n>=1;n=Math.floor(n/2)){try{localStorage.setItem('remainder-'+n,'x'.repeat(n))}catch{}}})()`);
  assert.equal(await js(`(()=>{try{localStorage.setItem('ally-chat-drafts','x'.repeat(1024));return false}catch(e){return e.name==='QuotaExceededError'}})()`), true);
  await js(`edit('synthetic full message '.repeat(100))`);
  await wait(`document.querySelector('textarea')?.value.length===2300`);
  await wait(`new Promise((resolve,reject)=>{const r=indexedDB.open('ally-composer');r.onsuccess=()=>{const db=r.result;const q=db.transaction('drafts').objectStore('drafts').get('synthetic');q.onsuccess=()=>{resolve(q.result?.text.length===2300);db.close()};q.onerror=reject};r.onerror=reject})`);
  await win.reload();
  await wait(`document.querySelector('textarea')?.value.length===2300`);
  await js(`edit('')`);
  await wait(`new Promise(resolve=>{const r=indexedDB.open('ally-composer');r.onsuccess=()=>{const db=r.result;const q=db.transaction('drafts').objectStore('drafts').get('synthetic');q.onsuccess=()=>{resolve(q.result?.text==='');db.close()}}})`);
  await win.reload();
  await wait(`document.querySelector('textarea')?.value===''`);
  console.log('PASS native quota exhaustion: typing, IndexedDB persistence, reload and intentional clear');
  win.destroy(); app.quit();
}
void run().catch(error => { console.error(error); app.exit(1); });
