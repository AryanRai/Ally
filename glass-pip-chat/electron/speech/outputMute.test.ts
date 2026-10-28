// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const fake=vi.hoisted(()=>({root:'',listeners:new Map<string,any>(),contents:[] as any[]}));
vi.mock('electron',()=>({app:{getPath:()=>fake.root,on:(name:string,callback:any)=>fake.listeners.set(name,callback)},webContents:{getAllWebContents:()=>fake.contents}}));
import {outputMute,setOutputMute,registerOutputMute} from './outputMute';
afterEach(()=>{if(fake.root)fs.rmSync(fake.root,{recursive:true,force:true});fake.contents=[];fake.listeners.clear();});
it('persists only output mute, updates current players and restores mute for newly created windows',()=>{
 fake.root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-output-mute-'));
 const contents={isDestroyed:()=>false,setAudioMuted:vi.fn(),send:vi.fn()};fake.contents=[contents];
 fs.writeFileSync(path.join(fake.root,'speech-settings.json'),'{"cloud":true,"voice":"saved"}');
 expect(outputMute()).toEqual({muted:false});
 expect(setOutputMute(true)).toEqual({muted:true});expect(outputMute()).toEqual({muted:true});
 expect(contents.setAudioMuted).toHaveBeenLastCalledWith(true);
 expect(contents.send).toHaveBeenLastCalledWith('speech:outputMute',{muted:true});
 registerOutputMute();const next={setAudioMuted:vi.fn()};fake.listeners.get('web-contents-created')({},next);
 expect(next.setAudioMuted).toHaveBeenCalledWith(true);
 setOutputMute(false);expect(contents.setAudioMuted).toHaveBeenLastCalledWith(false);
 expect(fs.readFileSync(path.join(fake.root,'speech-settings.json'),'utf8')).toBe('{"cloud":true,"voice":"saved"}');
 expect(()=>setOutputMute('true')).toThrow('true or false');
});
