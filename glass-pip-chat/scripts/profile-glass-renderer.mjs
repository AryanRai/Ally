// Synthetic native Chromium fixture; no preload, backend, real chat or input.
// electron scripts/profile-glass-renderer.mjs <original-source-directory> <output-directory>
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const root = process.cwd();
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-glass-profile-'));
app.setPath('userData', path.join(isolated, 'data'));
app.on('window-all-closed', () => {});
const modulePath = file => JSON.stringify(path.resolve(file).replaceAll('\\', '/'));
async function run() {
  const [original, destination] = process.argv.slice(2);
  if (!original || !destination) throw Error('Pass original sources and output directory');
  const out = path.resolve(destination); fs.mkdirSync(out, { recursive: true });
  await app.whenReady();
  const fixture = path.join(isolated, 'fixture'); fs.mkdirSync(fixture);
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  const oldChat = fs.readFileSync(path.join(original, 'ChatMessage.tsx'), 'utf8').replace(/from (['"])(\.[^'"]+)\1/g, (_, q, spec) => `from ${modulePath(path.join(root, 'src/components/chat', spec))}`);
  fs.writeFileSync(path.join(fixture, 'OldChatMessage.tsx'), oldChat);
  fs.copyFileSync(path.join(original, 'FlowField.tsx'), path.join(fixture, 'OldFlowField.tsx'));
  fs.writeFileSync(path.join(fixture, 'index.html'), '<html class="dark"><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
  fs.writeFileSync(path.join(fixture, 'main.tsx'), `
    import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
    import OldChat from './OldChatMessage';import OldFlow from './OldFlowField';
    import Chat from ${modulePath('src/components/chat/ChatMessage.tsx')};
    import Flow from ${modulePath('src/components/FlowField.tsx')};
    import Preview from ${modulePath('src/components/chat/CollapsedResponsePreview.tsx')};
    import ${modulePath('src/styles/index.css')};
    const root=createRoot(document.getElementById('root'));
    let which='before',mode='expanded',typed='',live='';
    const messages=Array.from({length:80},(_,i)=>({id:'saved-'+i,role:i%2?'assistant':'user',timestamp:i,content:i%2?'## Saved answer '+i+'\\n\\nA **complete** answer with $x^2$ and [reference](https://example.com).':'Question '+i,metadata:i%2?{segments:[{type:'text',content:'## Saved answer '+i+'\\n\\nA **complete** answer with $x^2$ and [reference](https://example.com).'},...Array.from({length:6},(_,j)=>({type:'tool',toolExecution:{id:'tool-'+i+'-'+j,name:'read_file',parameters:{path:'synthetic-'+j+'.ts'},status:'success',output:'Synthetic output'}}))]}:undefined}));
    function App(){const C=which==='before'?OldChat:Chat,F=which==='before'?OldFlow:Flow;return <div style={{position:'relative',width:'100vw',height:'100vh',overflow:'hidden',background:'#181a21',color:'#eee'}}><F state="idle"/><div style={{position:'relative',height:'90%',overflow:'auto'}}>{mode==='expanded'?messages.map(message=><C key={message.id} message={message} onEdit={()=>{}} onFork={()=>{}} onDelete={()=>{}} onRetry={()=>{}}/>):<Preview response={messages.at(-1).content} responseId="synthetic" isTyping={false} />}</div><textarea value={typed} readOnly/><span>{live}</span></div>}
    window.renderCase=(w,m)=>{which=w;mode=m;flushSync(()=>root.render(<App/>))};
    window.exercise=(kind,count=24)=>{const times=[];for(let i=0;i<count;i++){const start=performance.now();if(kind==='typing')typed+='x';else live+=' token';flushSync(()=>root.render(<App/>));times.push(performance.now()-start)}return{total:times.reduce((a,b)=>a+b,0),max:Math.max(...times),median:[...times].sort((a,b)=>a-b)[Math.floor(times.length/2)]}};
    window.animation=async(ms)=>{const times=[];let last=performance.now(),frame=0;await new Promise(resolve=>{const timer=setTimeout(resolve,ms+100);const end=last+ms;function tick(now){times.push(now-last);last=now;if(now<end)frame=requestAnimationFrame(tick);else{clearTimeout(timer);resolve()}}frame=requestAnimationFrame(tick)});cancelAnimationFrame(frame);return {frames:times.length,p95:times.length?[...times].sort((a,b)=>a-b)[Math.floor(times.length*.95)]:null,max:times.length?Math.max(...times):null}};
  `);
  await build({ configFile: false, root: fixture, base: './', plugins: [react()], css: { postcss: root }, logLevel: 'error', resolve: { alias: { '@': path.join(root, 'src') } }, build: { outDir: 'out' } });
  const results = [];
  const originals = new Map();
  const win = new BrowserWindow({ show: false, width:360, height:210, webPreferences: { offscreen:true, backgroundThrottling:false, sandbox:true, contextIsolation:true } });
  for (const mode of ['collapsed','expanded']) for (const which of ['before','after']) {
    console.log('Starting',mode,which);
    win.setSize(mode==='collapsed'?360:800,mode==='collapsed'?210:800);
    const js = source => win.webContents.executeJavaScript(source);
    await win.loadURL(pathToFileURL(path.join(fixture,'out/index.html')).href);
    await js('window.savedRAF=requestAnimationFrame;window.requestAnimationFrame=()=>0;void 0');
    await js(`renderCase('${which}','${mode}')`);
    await js('document.fonts.ready');
    await new Promise(r=>setTimeout(r,250));
    const dom = await js(`document.getElementById('root').innerHTML.replace(/ (?:id|aria-controls|aria-describedby)="[^"]*"/g,'')`);
    fs.writeFileSync(path.join(out,`${mode}-${which}.html`),dom);
    const pixels = (await win.webContents.capturePage()).toPNG();
    fs.writeFileSync(path.join(out,`${mode}-${which}.png`),pixels);
    let parity;
    if (which==='before') originals.set(mode,{dom,pixels});
    else {
      const original=originals.get(mode);parity={normalizedDOM:original.dom===dom,pixels:original.pixels.equals(pixels)};
      if(!parity.normalizedDOM || !parity.pixels) throw Error(`Presentation changed: ${mode} ${JSON.stringify(parity)}`);
    }
    await js('window.requestAnimationFrame=window.savedRAF;void 0');
    await new Promise(r=>setTimeout(r,500));
    const d=win.webContents.debugger; d.attach('1.3'); await d.sendCommand('Profiler.enable'); await d.sendCommand('Profiler.start');
    const typing = await js("exercise('typing')");
    const streaming = await js("exercise('streaming')");
    const frames = await js('animation(3000)');
    const profile = await d.sendCommand('Profiler.stop'); d.detach();
    fs.writeFileSync(path.join(out,`${mode}-${which}.cpuprofile`),JSON.stringify(profile.profile));
    results.push({mode,which,typing,streaming,frames,parity});
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2)); win.destroy(); app.quit();
}
run().catch(error=>{console.error(error);app.exit(1)});
