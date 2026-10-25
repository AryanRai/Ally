// Synthetic native Chromium avatar lifecycle; no backend or real input.
// electron scripts/profile-avatar-visibility.mjs <original-AgentPresence.tsx> <output-directory>
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const root=process.cwd(), temp=fs.mkdtempSync(path.join(os.tmpdir(),'ally-avatar-profile-'));
app.setPath('userData',path.join(temp,'data'));app.on('window-all-closed',()=>{});
const modulePath=p=>JSON.stringify(path.resolve(p).replaceAll('\\','/'));
async function run(){
  const [original,destination]=process.argv.slice(2);if(!original||!destination)throw Error('Pass baseline component and output');
  const out=path.resolve(destination);fs.mkdirSync(out,{recursive:true});await app.whenReady();
  fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'junction');
  const old=fs.readFileSync(original,'utf8').replace(/from (['"])(\.[^'"]+)\1/g,(_,q,spec)=>`from ${modulePath(path.join(root,'src/components/glow',spec))}`);
  fs.writeFileSync(path.join(temp,'OldPresence.tsx'),old);
  fs.writeFileSync(path.join(temp,'index.html'),'<html><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
  fs.writeFileSync(path.join(temp,'main.tsx'),`
    import React from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
    import Old from'./OldPresence';import Current from ${modulePath('src/components/glow/AgentPresence.tsx')};
    import ${modulePath('src/styles/index.css')};
    const root=createRoot(document.getElementById('root'));let calls=0;
    const ctm=SVGGraphicsElement.prototype.getScreenCTM;SVGGraphicsElement.prototype.getScreenCTM=function(...args){calls++;return ctm.apply(this,args)};
    window.showCase=(which,robot)=>flushSync(()=>root.render(React.createElement(which==='before'?Old:Current,{size:36,mood:'idle',sensing:robot})));
    window.robotState=()=>{const robot=document.querySelector('agent-robot-avatar'),parent=robot.parentElement;return{calls,display:getComputedStyle(parent).display,opacity:getComputedStyle(parent).opacity,rect:robot.getBoundingClientRect().width,connected:robot.isConnected}};
    window.clearCalls=()=>{calls=0};
  `);
  await build({configFile:false,root:temp,base:'./',plugins:[react()],css:{postcss:root},logLevel:'error',resolve:{alias:{'@':path.join(root,'src')}},build:{outDir:'out'}});
  const win=new BrowserWindow({show:false,width:160,height:140,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}});
  const js=s=>win.webContents.executeJavaScript(s),pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
  for(const which of ['before','after']){
    await win.loadURL(pathToFileURL(path.join(temp,'out/index.html')).href);await js(`showCase('${which}',false)`);await pause(700);await js('clearCalls()');
    win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Profiler.enable');await win.webContents.debugger.sendCommand('Profiler.start');
    await pause(3000);const hidden=await js('robotState()');const profile=await win.webContents.debugger.sendCommand('Profiler.stop');win.webContents.debugger.detach();
    fs.writeFileSync(path.join(out,which+'.cpuprofile'),JSON.stringify(profile.profile));
    await js(`showCase('${which}',true)`);await pause(700);await js('clearCalls()');await pause(600);const visible=await js('robotState()');
    await js(`showCase('${which}',false)`);await pause(250);const fading=await js('robotState()');await pause(500);const faded=await js('robotState()');
    if(which==='after'&&!(hidden.calls===0&&visible.calls>0&&fading.display!=='none'&&faded.display==='none'&&visible.connected&&faded.connected))throw Error('Avatar lifecycle regression');
    results.push({which,hidden,visible,fading,faded});
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));win.destroy();app.quit();
}
run().catch(e=>{console.error(e);app.exit(1)});
