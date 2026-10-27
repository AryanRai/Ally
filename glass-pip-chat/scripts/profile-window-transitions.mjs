// Isolated production Chromium transition fixture. Synthetic chats only.
// electron scripts/profile-window-transitions.mjs <output-directory>
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = process.cwd();
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-transitions-'));
app.setPath('userData', path.join(isolated, 'data'));
app.on('window-all-closed', () => {});
const modulePath = file => JSON.stringify(path.resolve(file).replaceAll('\\', '/'));

async function run() {
  const out = path.resolve(process.argv[2]); fs.mkdirSync(out, { recursive: true });
  await app.whenReady();
  const fixture = path.join(isolated, 'fixture'); fs.mkdirSync(fixture);
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  fs.writeFileSync(path.join(fixture, 'index.html'), '<html class="dark"><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
  fs.writeFileSync(path.join(fixture, 'main.tsx'), `
    import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
    import{motion,AnimatePresence}from'framer-motion';
    import Chat from ${modulePath('src/components/chat/ChatMessage.tsx')};
    import Surface from ${modulePath('src/components/chat/ExpandedChatSurface.tsx')};
    import{useWindowSizing}from ${modulePath('src/hooks/useWindowSizing.ts')};
    import{Conversation,ConversationContent,ConversationScrollButton}from ${modulePath('src/components/ai-elements/conversation.tsx')};
    import ${modulePath('src/styles/index.css')};
    const root=createRoot(document.getElementById('root'));let which='before',collapsed=true,version=0,messages=[],frames=[],lastFrame=0,start=0;
    window.pip={resizeWindow:(w,h)=>console.log('TRANSITION_RESIZE:'+w+','+h)};
    const tick=t=>{if(start)frames.push(t-lastFrame);lastFrame=t;requestAnimationFrame(tick)};requestAnimationFrame(tick);
    function OldSizing(w,h,c,set){useEffect(()=>{set(true);const delay=c?200:50;const a=setTimeout(()=>window.pip.resizeWindow(w,h),delay),b=setTimeout(()=>set(false),400+delay);return()=>{clearTimeout(a);clearTimeout(b)}},[w,h,c])}
    function Editor(){const[text,setText]=useState('');return <textarea aria-label="Retained edit" value={text} onChange={e=>setText(e.target.value)}/>}
    function App(){const[resizing,setResizing]=useState(false);(which==='before'?OldSizing:useWindowSizing)(collapsed?360:448,collapsed?96:560,collapsed,setResizing);
      const transcript=<Conversation data-test-log="true"><ConversationContent>{(collapsed?[]:messages).map(message=><Chat key={message.id} message={message} onEdit={()=>{}} onFork={()=>{}} onDelete={()=>{}} onRetry={()=>{}}/>)}</ConversationContent><ConversationScrollButton/></Conversation>;
      const controls=<><Editor/><span data-version>{version}</span></>;
      return <div style={{height:'100vh',display:'flex',flexDirection:'column',background:'#181a21',color:'#eee'}}><header style={{height:44,flexShrink:0}}>{collapsed?'Floating pill':'Expanded chat'}</header>{which==='before'?<AnimatePresence mode="wait">{!collapsed&&<motion.div key="content" className="flex flex-col h-[calc(100%-44px)]" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.2}}><div className="relative flex min-h-0 flex-1 flex-col">{transcript}</div>{controls}</motion.div>}</AnimatePresence>:<Surface collapsed={collapsed} transcript={transcript}>{controls}</Surface>}</div>}
    const render=()=>flushSync(()=>root.render(<App/>));
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    window.setupCase=async(w,count)=>{root.render(null);await wait(30);which=w;collapsed=true;version=0;messages=Array.from({length:count},(_,i)=>({id:'saved-'+i,role:i%2?'assistant':'user',timestamp:i,content:i%2?'## Saved answer '+i+'\\n\\nA **complete** answer with $x^2$ and [reference](https://example.com).':'Question '+i,metadata:i%2?{segments:[{type:'text',content:'## Saved answer '+i+'\\n\\nA **complete** answer with $x^2$ and [reference](https://example.com).'},...Array.from({length:6},(_,j)=>({type:'tool',toolExecution:{id:'tool-'+i+'-'+j,name:'read_file',parameters:{path:'synthetic-'+j+'.ts'},status:'success',output:'Synthetic output'}}))]}:undefined}));render();await wait(300)};
    window.toggleCase=async(c)=>{frames=[];start=performance.now();lastFrame=start;collapsed=c;render();const commit=performance.now()-start;const composerReady=!!document.querySelector('[aria-label="Retained edit"]')?.getClientRects().length;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const painted=performance.now()-start;let transcriptReady;
      if(!c){while(true){const log=document.querySelector('[data-test-log]');if(log&&log.getClientRects().length&&log.querySelectorAll('.group').length===messages.length)break;if(performance.now()-start>15000)throw Error('Transcript never became ready');await wait(20)}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));transcriptReady=performance.now()-start}
      await wait(550);start=0;return{commit,painted,composerReady,transcriptReady,maxFrame:Math.max(...frames),p95Frame:[...frames].sort((a,b)=>a-b)[Math.floor(frames.length*.95)],nodes:document.querySelectorAll('*').length,width:innerWidth,height:innerHeight}};
    window.retentionCase=async()=>{const log=document.querySelector('[data-test-log] > div');log.scrollTop=300;log.dispatchEvent(new WheelEvent('wheel',{deltaY:-10,bubbles:true}));await wait(50);const before=log.scrollTop;const first=log.firstElementChild.firstElementChild;await window.toggleCase(true);version++;render();await wait(50);await window.toggleCase(false);const next=document.querySelector('[data-test-log] > div');return{sameMessage:first===next.firstElementChild.firstElementChild,scrollBefore:before,scrollAfter:next.scrollTop,latestVersion:document.querySelector('[data-version]').textContent}};
    window.rapidCase=async()=>{collapsed=true;render();await wait(80);collapsed=false;render();await wait(350);return{visible:getComputedStyle(document.querySelector('[data-test-log]')).display!=='none',width:innerWidth,height:innerHeight,messages:document.querySelectorAll('[data-test-log] .group').length}};
  `);
  await build({ configFile:false, root:fixture, base:'./', plugins:[react()], css:{postcss:root}, logLevel:'error', resolve:{alias:{'@':path.join(root,'src')}}, build:{outDir:'out'} });
  const results=[];
  const parityBaseline=new Map();
  const win=new BrowserWindow({show:false,width:360,height:96,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}});
  let resizeEvents=[],epoch=0;
  win.webContents.on('console-message',(_event,_level,message)=>{
    if(!message.startsWith('TRANSITION_RESIZE:'))return;
    const [width,height]=message.slice('TRANSITION_RESIZE:'.length).split(',').map(Number);
    const received=Date.now()-epoch;win.setSize(width,height,true);
    resizeEvents.push({received,width,height,bounds:win.getSize()});
  });
  const js=source=>win.webContents.executeJavaScript(source);
  for(const count of [8,160])for(const which of ['before','after']){
    console.log('Starting',count,which);await win.loadURL(pathToFileURL(path.join(fixture,'out/index.html')).href);
    await js('document.fonts.ready');await js(`setupCase('${which}',${count})`);
    const toggle=async(c)=>{resizeEvents=[];epoch=Date.now();const stats=await js(`toggleCase(${c})`);return{...stats,resizes:[...resizeEvents]}};
    const cold=await toggle(false);const cycles=[];
    const debuggerSession=win.webContents.debugger;
    debuggerSession.attach('1.3');await debuggerSession.sendCommand('Profiler.enable');await debuggerSession.sendCommand('Profiler.start');
    for(let i=0;i<3;i++)cycles.push({collapse:await toggle(true),expand:await toggle(false)});
    const profile=await debuggerSession.sendCommand('Profiler.stop');debuggerSession.detach();
    fs.writeFileSync(path.join(out,`${count}-${which}.cpuprofile`),JSON.stringify(profile.profile));
    const retention=await js('retentionCase()');const rapid=await js('rapidCase()');
    if(which==='after'&&(!retention.sameMessage||Math.abs(retention.scrollBefore-retention.scrollAfter)>1||retention.latestVersion!=='1'||!rapid.visible||rapid.messages!==count))throw Error('Retained transition regression: '+JSON.stringify({retention,rapid}));
    // Mixed-DPI native frame rounding can differ by one DIP after setSize.
    // Normalize only the final parity capture, after all timing/gesture checks.
    await js(`(async()=>{const surface=document.getElementById('root').firstElementChild;surface.style.width='448px';surface.style.height='560px';const log=document.querySelector('[data-test-log] > div');log.dispatchEvent(new WheelEvent('wheel',{deltaY:-20,bubbles:true}));log.scrollTop=0;await new Promise(r=>setTimeout(r,250))})()`);
    const dom=await js(`document.getElementById('root').innerHTML.replace(/ (?:id|aria-controls|aria-describedby)="[^"]*"/g,'').replace(/ style="[^"]*"/g,'')`);
    fs.writeFileSync(path.join(out,`${count}-${which}.html`),dom);
    const pixels=(await win.webContents.capturePage({x:0,y:0,width:448,height:560})).toPNG();fs.writeFileSync(path.join(out,`${count}-${which}.png`),pixels);
    let parity;
    if(which==='before')parityBaseline.set(count,{dom,pixels});
    else{const before=parityBaseline.get(count);parity={normalizedDOM:before.dom===dom,pixels:before.pixels.equals(pixels)};if(!parity.normalizedDOM||!parity.pixels)throw Error('Presentation changed: '+count+' '+JSON.stringify(parity))}
    debuggerSession.attach('1.3');await debuggerSession.sendCommand('HeapProfiler.collectGarbage');const expandedHeap=await debuggerSession.sendCommand('Runtime.getHeapUsage');const expandedDOM=await debuggerSession.sendCommand('Memory.getDOMCounters');
    await toggle(true);await debuggerSession.sendCommand('HeapProfiler.collectGarbage');const collapsedHeap=await debuggerSession.sendCommand('Runtime.getHeapUsage');const collapsedDOM=await debuggerSession.sendCommand('Memory.getDOMCounters');debuggerSession.detach();
    results.push({count,which,cold,cycles,retention,rapid,parity,memory:{expandedHeap,collapsedHeap,expandedDOM,collapsedDOM}});
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  }
  console.log(JSON.stringify(results,null,2));win.destroy();app.quit();
}
run().catch(error=>{console.error(error);app.exit(1)});
