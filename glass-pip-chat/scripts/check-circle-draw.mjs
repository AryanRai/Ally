import {app,BrowserWindow,nativeImage,desktopCapturer} from 'electron';
let captureCalls=0; const getSources=desktopCapturer.getSources.bind(desktopCapturer); desktopCapturer.getSources=async (...args)=>{captureCalls++;return getSources(...args);};
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ally-circle-draw-check-'));
app.setPath('userData',temp);
let main,capture; app.on("web-contents-created",(_,contents)=>{contents.on("preload-error",(_,file,error)=>console.error("PRELOAD",file,error.message));contents.on("console-message",(_,level,message)=>console.log("RENDERER",level,message.slice(0,200)));contents.on("render-process-gone",(_,details)=>console.log("GONE",details.reason));});
const preload=path.join(temp,'test.cjs');
fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');let last=null;ipcRenderer.on('circle:ask',(_,ask)=>last=ask);contextBridge.exposeInMainWorld('check',{chat:id=>ipcRenderer.invoke('circle:chat',id),circle:()=>ipcRenderer.invoke('circle:start'),last:()=>last,start:(chat,id)=>ipcRenderer.invoke('tutor:start',chat,undefined,id),end:id=>ipcRenderer.invoke('tutor:end',id)});`);
const deadline=setTimeout(()=>{console.error('FAIL timed out');if(capture)fs.rmSync(capture.imagePath,{force:true});app.exit(1);},45000);
async function wait(read){const until=Date.now()+6000;while(Date.now()<until){const value=await read();if(value)return value;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('UI state timed out');}
async function run(){ try {
 console.log("CHECK importing circle"); const circleModule=await import(pathToFileURL(path.join(root,'dist/electron/capture/circle.js')));
 console.log("CHECK importing tutor"); const tutorModule=await import(pathToFileURL(path.join(root,'dist/electron/visualTutor/ipc.js')));
 circleModule.registerCircleIpc(()=>main??null);tutorModule.registerVisualTutorIpc(()=>main??null);
 console.log("CHECK handlers registered"); await app.whenReady(); console.log("CHECK ready");
 main=new BrowserWindow({show:false,width:400,height:250,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
 await main.loadURL('data:text/html,<html><body>Isolated Circle integration check</body></html>'); console.log('CHECK main loaded');
 await main.webContents.executeJavaScript("window.check.chat('circle-test-chat').then(()=>window.check.circle())");
 console.log("CHECK circle opened"); const circle=BrowserWindow.getAllWindows().find(win=>win.id!==main.id);assert.ok(circle);
 console.log("CHECK circle document",circle.webContents.getURL(),circle.isVisible(),circle.webContents.isLoading()); console.log("CHECK circle globals",await circle.webContents.executeJavaScript("({ready:document.readyState,pip:typeof window.pip,canvas:!!document.querySelector('canvas')})")); const original=nativeImage.createFromDataURL(await circle.webContents.executeJavaScript('window.pip.circle.getShot()'));
 console.log('CHECK pixels loaded'); await circle.webContents.executeJavaScript(`(()=>{const canvas=document.querySelector('canvas');canvas.setPointerCapture=()=>{};for(const [type,x,y] of [['pointerdown',100,100],['pointermove',200,150],['pointermove',400,300],['pointerup',400,300]])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:x,clientY:y,pointerId:1}));return true;})()`);
 console.log("CHECK pointer sent"); await wait(()=>circle.webContents.executeJavaScript("[...document.querySelectorAll('button')].some(button=>button.textContent==='Draw to explain')"));
 void circle.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button=>button.textContent==='Draw to explain').click()").catch(()=>{});
 console.log("CHECK clicked draw"); const ask=await wait(()=>main.webContents.executeJavaScript('window.check.last()'));
 assert.equal(ask.chatId,'circle-test-chat');assert.ok(ask.tutorCaptureId);assert.equal(ask.imagePath,'');
 await assert.rejects(main.webContents.executeJavaScript(`window.check.start('another-chat',${JSON.stringify(ask.tutorCaptureId)})`),/another chat/);
 console.log("CHECK handoff"); capture=await main.webContents.executeJavaScript(`window.check.start('circle-test-chat',${JSON.stringify(ask.tutorCaptureId)})`);
 assert.equal(capture.board.chatId,'circle-test-chat');assert.ok(capture.board.focus);
 const size=original.getSize(),bounds=capture.board.bounds;
 const expected={x:Math.round(90*size.width/bounds.width),y:Math.round(90*size.height/bounds.height),width:Math.round(320*size.width/bounds.width),height:Math.round(220*size.height/bounds.height)};
 assert.deepEqual(nativeImage.createFromPath(capture.imagePath).getSize(),{width:expected.width,height:expected.height});
 assert.equal(captureCalls,1,'drawing reuses the original screenshot without a second capture'); assert.deepEqual(nativeImage.createFromPath(capture.imagePath).toBitmap(),original.crop(expected).toBitmap(),'the original selected pixels are reused');
 assert.equal(capture.board.focus.x,90/bounds.width*1000);
 await assert.rejects(main.webContents.executeJavaScript(`window.check.start('circle-test-chat',${JSON.stringify(ask.tutorCaptureId)})`),/expired/);
 const overlay=BrowserWindow.getAllWindows().find(win=>win.id!==main.id);
 assert.equal(await overlay.webContents.executeJavaScript('typeof window.pip'),'undefined');
 const local=await overlay.webContents.executeJavaScript('window.tutor.overlay()');
 assert.ok(nativeImage.createFromDataURL(local.screenshot).getSize().width>expected.width,'freeze retains the full display locally');
 await main.webContents.executeJavaScript(`window.check.end(${JSON.stringify(capture.board.id)})`);
 console.log(JSON.stringify({status:'PASS',circleAction:true,originalPixels:true,selectedCropOnly:true,displayFocus:true,sameChat:true,oneTimeHandoff:true,restrictedOverlay:true}));
 fs.rmSync(capture.imagePath,{force:true});clearTimeout(deadline);app.exit(0);
} catch(error){console.error('FAIL',error.stack??error);if(capture)fs.rmSync(capture.imagePath,{force:true});clearTimeout(deadline);app.exit(1);}


}
void run();
