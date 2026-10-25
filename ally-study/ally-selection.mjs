import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {readNativeEvents} from './ally-stream.mjs';

export class AllySelection {
  constructor({file, configFile, fetchImpl=fetch, pollMs=750}) {
    this.file=file;this.configFile=configFile;this.fetch=fetchImpl;this.pollMs=pollMs;this.activeTurn=null;
    try {this.selected=JSON.parse(fs.readFileSync(file,'utf8'));if(this.selected)this.validate(this.selected);}
    catch(error) {if(error.code!=='ENOENT')throw error;this.selected=null;}
  }
  validate(value) {
    if(!value || typeof value.chatId!=='string' || !value.chatId || value.chatId.length>240 || !['codex','claude'].includes(value.provider) || !['readonly','edit','full'].includes(value.permission)) throw Error('Invalid selected chat.');
  }
  snapshot() {return {selected:this.selected,activeTurn:this.activeTurn};}
  async request(route, {body, signal, headers={}, raw=false}={}) {
    const config=JSON.parse(fs.readFileSync(this.configFile,'utf8'));
    if(!config.enabled || !Number.isInteger(config.port) || config.port<1 || config.port>65535 || !config.token)throw Error('Open Ally with its local chat bridge enabled.');
    const binary=Buffer.isBuffer(body);
    const response=await this.fetch(`http://127.0.0.1:${config.port}/v1/${route}`,{
      method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':binary?'application/octet-stream':'application/json',...headers},
      body:body===undefined?undefined:binary?body:JSON.stringify(body),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000),
    });
    if (raw && response.ok) return response;
    const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error || `Ally returned ${response.status}`),{status:response.status});return value;
  }
  save(selected) {
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    fs.writeFileSync(this.file+'.staged',JSON.stringify(selected,null,2));fs.renameSync(this.file+'.staged',this.file);
    this.selected=selected;
  }
  async refresh() {
    const shared=await this.request('selection');
    if(typeof shared.version!=='string')throw Error('Update Ally desktop to the build with shared notch selection.');
    if(shared.selected)this.validate(shared.selected);
    this.sharedVersion=shared.version;
    if(JSON.stringify(shared.selected)!==JSON.stringify(this.selected))this.save(shared.selected);
    return this.snapshot();
  }
  async select(value) {
    this.validate(value);
    await this.refresh();const version=this.sharedVersion;
    const history=await this.request(`chats/${encodeURIComponent(value.chatId)}`);
    const {chat}=history;
    if(chat.provider!==value.provider)throw Error('Selected chat engine does not match.');
    const shared=await this.request('selection',{body:{chatId:chat.id,provider:chat.provider,permission:value.permission,version}});
    if(shared.selected)this.validate(shared.selected);
    this.sharedVersion=shared.version;this.save(shared.selected);
    return {...this.snapshot(),history:shared.accepted?history:undefined,conflict:!shared.accepted};
  }
  async continue({words,images=[],context,signal,onTurn=()=>{},onText}) {
    const selected=this.selected && {...this.selected};
    if(!selected)throw Error('Choose a chat in Ally first.');
    if(this.continuing)throw Error('The selected chat is already responding. Expand Chat to follow it.');
    this.continuing=true;
    let sent;
    try {
      const attachments=[];
      for(const file of images) {
        const result=await this.request('attachments',{body:fs.readFileSync(file),signal,headers:{'x-ally-filename':encodeURIComponent(path.basename(file)),'Content-Type':path.extname(file)==='.png'?'image/png':'image/jpeg'}});
        attachments.push(result.attachment.id);
      }
      sent=await this.request('messages',{body:{provider:selected.provider,permission:selected.permission,chatId:selected.chatId,text:words,attachments,...(context===undefined?{}:{presentation:'native-study',context}),requestId:crypto.randomUUID()},signal});
      this.activeTurn={id:sent.id,chatId:selected.chatId};onTurn(this.activeTurn);
      if (onText) {
        const stream = await this.request(`turns/${encodeURIComponent(sent.id)}/events`, {signal, raw:true});
        const text = await readNativeEvents(stream, {signal,onText});
        return {text,provider:selected.provider};
      }
      while(true) {
        const turn=await this.request(`turns/${encodeURIComponent(sent.id)}`,{signal});
        if(turn.status==='error')throw Error(turn.error || 'Ally could not complete the response.');
        if(turn.status==='done') {
          if(!turn.reply?.text?.trim())throw Error('Open Chat to view this response; it has no spoken text.');
          return {text:turn.reply.text,provider:selected.provider};
        }
        await delay(this.pollMs,undefined,{signal});
      }
    } finally {
      if(signal?.aborted && sent)await this.request(`turns/${encodeURIComponent(sent.id)}/stop`,{body:{}}).catch(()=>{});
      this.activeTurn=null;this.continuing=false;
    }
  }
}

export function spokenProgram(text) {
  // Render the existing chat's answer as native speech; never evaluate it as code.
  const chunks=[];let part='';let bytes=0;
  for(const character of String(text)) {
    const size=Buffer.byteLength(character);
    if(part && (bytes+size>4000 || part.length+character.length>2800)){chunks.push(part);part='';bytes=0;}
    part+=character;bytes+=size;
  }
  if(part)chunks.push(part);
  return '```javascript\n'+chunks.map((part,index)=>`step(${index}); say(${JSON.stringify(part)});`).join('\n')+'\n```';
}
