// @vitest-environment node
import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ManimMedia,isManimClipUrl} from './media';
it('serves only registered clips with byte ranges and revokes ended boards',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ally-manim-media-')),file=path.join(dir,'clip.mp4'),server=new ManimMedia();
 try{await fs.writeFile(file,'synthetic-mp4');const url=await server.register(file,'board');expect(isManimClipUrl(url)).toBe(true);
  const r=await fetch(url,{headers:{Range:'bytes=2-5'}});expect(r.status).toBe(206);expect(await r.text()).toBe('nthe');
  expect(Buffer.from(await server.read(url,'board')).toString()).toBe('synthetic-mp4');
  await expect(server.read(url,'other-board')).rejects.toThrow('no longer available');
  await expect(server.read('file:///private.mp4','board')).rejects.toThrow('Unknown');
  expect((await fetch(url,{headers:{Range:'bytes=99-'}})).status).toBe(416);
  expect((await fetch(url.replace(/[a-f0-9]{32}\.mp4$/,'0'.repeat(32)+'.mp4'))).status).toBe(404);
  server.revoke('board');expect((await fetch(url)).status).toBe(404);
  await expect(server.read(url,'board')).rejects.toThrow('no longer available');
  expect(isManimClipUrl('file:///C:/private.mp4')).toBe(false);
 }finally{server.close();if(path.dirname(dir)===os.tmpdir())await fs.rm(dir,{recursive:true,force:true});}
});
it('rejects oversized media before allocating its contents',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ally-manim-limit-')),file=path.join(dir,'large.mp4'),server=new ManimMedia();
 try{await fs.writeFile(file,'');await fs.truncate(file,64*1024*1024+1);const url=await server.register(file,'board');await expect(server.read(url,'board')).rejects.toThrow('64 MB');}
 finally{server.close();await fs.rm(file,{force:true});await fs.rmdir(dir);}
});
