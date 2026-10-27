const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('allyBrowser',{
  action:(action,url)=>ipcRenderer.invoke('ally-browser:toolbar',action,url),
  onState:callback=>ipcRenderer.on('ally-browser:state',(_event,state)=>callback(state)),
});
