import {BrowserWindow} from 'electron';
export interface LocalPhoneView {frame(jpeg:Buffer):void;close():void}
/** Isolated, first-party local display. No preload, network, recording or frame-returning tool. */
export function embeddedPhoneViewer(onStop:()=>void):LocalPhoneView{
 const win=new BrowserWindow({width:460,height:780,title:'Ally · Phone viewer',backgroundColor:'#0b1014',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
 const html=`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>body{margin:0;background:#0b1014;color:#dcebe7;font:14px system-ui;display:flex;flex-direction:column;height:100vh}header{padding:14px;display:flex;justify-content:space-between;align-items:center}button{padding:8px 14px;border:0;border-radius:18px;background:#a5f8dc;color:#102219}img{min-height:0;flex:1;width:100%;object-fit:contain}p{padding:0 14px;color:#98aaa5}</style><header><b>Ally phone · Local viewer</b><button id="stop">Stop</button></header><p id="notice">Waiting for your phone's native screen-sharing decision…</p><img id="frame" alt="User-approved live phone preview"><script>document.getElementById('stop').onclick=()=>window.close();</script>`;
 let loaded=false,busy=false;
 void win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html)).then(()=>{loaded=true;}).catch(onStop);
 win.once('closed',onStop);
 return {frame(bytes){if(!loaded||busy||win.isDestroyed())return;busy=true;
  void win.webContents.executeJavaScript(`document.getElementById('notice').textContent='Read-only preview · no audio, input or recording';document.getElementById('frame').src=${JSON.stringify('data:image/jpeg;base64,'+bytes.toString('base64'))};`).catch(onStop).finally(()=>{busy=false;});
 },close(){if(!win.isDestroyed())win.destroy();}};
}
