// Real Chromium storage/CPU profile, isolated user data and synthetic history only.
// Run: electron scripts/profile-chat-persistence.mjs <output-directory>
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';

const root = process.cwd();
const output = path.resolve(process.argv[2] || '.chat-profile');
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-persistence-profile-'));
app.setPath('userData', path.join(isolated, 'user-data'));
fs.mkdirSync(output, { recursive: true });
async function run() {
  await app.whenReady();
  const fixture = path.join(isolated, 'fixture'); fs.mkdirSync(fixture);
  fs.writeFileSync(path.join(fixture, 'index.html'), '<html><body><script type="module" src="./main.js"></script></body></html>');
  fs.writeFileSync(path.join(fixture, 'main.js'), `
    import { ChatManager } from ${JSON.stringify(path.join(root, 'src/utils/chatManager.ts').replaceAll('\\', '/'))};
    const chats = Array.from({length: 20}, (_, c) => ({id:'chat-'+c, title:'Synthetic '+c,
      createdAt:c+1, updatedAt:c+1, agent:{provider:'codex',sessionId:'synthetic-'+c},
      messages:Array.from({length:80},(_,i)=>({id:'m-'+i,role:i%2?'assistant':'user',timestamp:i+1,
        content:'Synthetic Markdown **answer** with math $x^2$. '.repeat(20)}))}));
    window.prepare = () => { localStorage.clear(); localStorage.setItem('glass_pip_chats',JSON.stringify({chats,activeChat:'chat-7'})); };
    window.measure = async () => {
      const manager=ChatManager.getInstance(); const times=[]; const stalls=[];
      const timer=setInterval(()=>{const now=performance.now();stalls.push(now-last);last=now},5);let last=performance.now();
      for(let i=0;i<24;i++) { await new Promise(r=>setTimeout(r,0)); const start=performance.now();manager.switchToChat('chat-'+(i%20));times.push(performance.now()-start); }
      await new Promise(r=>setTimeout(r,20));clearInterval(timer);
      const start=performance.now();for(let i=0;i<24;i++) manager.syncAgentSession('chat-7','codex','synthetic-7',structuredClone(chats[7].messages));
      const syncMs=performance.now()-start;
      return {storageBytes:localStorage.getItem('glass_pip_chats').length,selectionMs:times.reduce((a,b)=>a+b,0),maxSelectionMs:Math.max(...times),maxTimerGapMs:Math.max(...stalls),syncMs,active:manager.getActiveChat().id};
    };
    window.selection = () => ChatManager.getInstance().getActiveChat().id;
  `);
  await build({configFile:false,root:fixture,base:'./',logLevel:'error',build:{outDir:'out'}});
  const win = new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false,contextIsolation:true,sandbox:true}});
  await win.loadFile(path.join(fixture,'out/index.html'));
  await win.webContents.executeJavaScript('prepare()');
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Profiler.enable');
  await win.webContents.debugger.sendCommand('Profiler.start');
  const result = await win.webContents.executeJavaScript('measure()');
  const {profile} = await win.webContents.debugger.sendCommand('Profiler.stop');
  await win.loadFile(path.join(fixture,'out/index.html'));
  result.reloadedSelection = await win.webContents.executeJavaScript('selection()');
  if (result.reloadedSelection !== result.active) throw Error('Exact selection lost on renderer restart');
  const replacement = path.join(isolated,'replacement-build');
  fs.cpSync(path.join(fixture,'out'),replacement,{recursive:true});
  await win.loadFile(path.join(replacement,'index.html'));
  result.replacementBuildSelection = await win.webContents.executeJavaScript('selection()');
  if (result.replacementBuildSelection !== result.active) throw Error('Exact selection lost across candidate paths');
  fs.writeFileSync(path.join(output,'renderer.cpuprofile'),JSON.stringify(profile));
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));win.webContents.debugger.detach();win.destroy();app.quit();
}
void run().catch(error=>{console.error(error);app.exit(1)});
