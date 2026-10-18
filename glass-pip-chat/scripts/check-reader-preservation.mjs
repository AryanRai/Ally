// Native Chromium QA with synthetic content and a separate user-data directory.
// electron scripts/check-reader-preservation.mjs <original-component.tsx> <output-dir>
import {app,BrowserWindow} from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
const root=process.cwd();
const isolated=fs.mkdtempSync(path.join(os.tmpdir(),'ally-reader-preservation-'));
app.setPath('userData',path.join(isolated,'data'));
async function run(){
  const [original,destination]=process.argv.slice(2);
  if(!original||!destination)throw Error('Pass original component and output directory');
  const output=path.resolve(destination);fs.mkdirSync(output,{recursive:true});
  await app.whenReady();
  const fixture=path.join(isolated,'fixture');fs.mkdirSync(fixture);
  fs.symlinkSync(path.join(root,'node_modules'),path.join(fixture,'node_modules'),'junction');
  const modulePath=file=>JSON.stringify(path.resolve(file).replaceAll('\\','/'));
  fs.writeFileSync(path.join(fixture,'index.html'),'<html class="dark"><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
  fs.writeFileSync(path.join(fixture,'main.tsx'),`
    import React from 'react';import{createRoot}from'react-dom/client';
    import Original from ${modulePath(original)};
    import Current from ${modulePath('src/components/chat/CollapsedResponsePreview.tsx')};
    import ${modulePath('src/styles/index.css')};
    const root=createRoot(document.getElementById('root')!);
    const text='# Synthetic answer\\n\\nPreserve **all** formatting, [links](https://example.com) and $x^2$.\\n\\n- First item\\n- Second item\\n\\n'+ 'Long paragraph for scrolling. '.repeat(120);
    const props={response:text,responseId:'prompt',isTyping:false,olderReplies:[{id:'older',role:'assistant',content:'Older synthetic reply',timestamp:1}]};
    document.body.style.cssText='margin:0;padding:12px;background:#181a21;color:#eee';
    window.renderCase=(which)=>root.render(React.createElement(which==='original'?Original:Current,{...props,...(which==='restored'?{readerChatId:'exact'}:{})}));
    window.reset=()=>root.render(null);
  `);
  await build({configFile:false,root:fixture,base:'./',plugins:[react()],css:{postcss:root},logLevel:'error',resolve:{alias:{'@':path.join(root,'src')}},build:{outDir:'out'}});
  const win=new BrowserWindow({show:false,width:420,height:360,webPreferences:{backgroundThrottling:false,sandbox:true,contextIsolation:true}});
  await win.loadFile(path.join(fixture,'out/index.html'));
  const js=source=>win.webContents.executeJavaScript(source);
  const settle=()=>js('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
  await js("renderCase('original')");await settle();
  const before=await js("document.getElementById('root').innerHTML");
  const beforePng=(await win.webContents.capturePage()).toPNG();fs.writeFileSync(path.join(output,'before.png'),beforePng);
  await js('reset()');await settle();await js("renderCase('current')");await settle();
  const after=await js("document.getElementById('root').innerHTML");
  const afterPng=(await win.webContents.capturePage()).toPNG();fs.writeFileSync(path.join(output,'after.png'),afterPng);
  if(before!==after)throw Error('Default reader DOM changed');
  if(!beforePng.equals(afterPng))throw Error('Default reader pixels changed');
  await js('reset()');await settle();await js("renderCase('restored')");await settle();
  await js(`document.querySelector('[aria-label="Older reply"]').click()`);await settle();
  await js(`const p=document.querySelector('[data-ally-reply-reader]');p.scrollTop=0;p.dispatchEvent(new Event('scroll',{bubbles:true}))`);
  await win.loadFile(path.join(fixture,'out/index.html'));
  await js("renderCase('restored')");await settle();
  if(!await js("document.body.textContent.includes('Older synthetic reply')"))throw Error('Reader bookmark lost on reload');
  console.log('PASS exact default DOM/pixels and saved older-reply restoration in native Chromium');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({domEqual:true,pixelsEqual:true,olderReplyRestored:true},null,2));
  win.destroy();app.quit();
}
void run().catch(error=>{console.error(error);app.exit(1)});
