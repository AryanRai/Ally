// @vitest-environment node
import { expect, it } from 'vitest';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChromeBridge } from './chrome';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve,ms));
it('waits through native-host reconnect before dispatch and never replays an uncertain command', async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ally-browser-reconnect-'));
 const bridge=new ChromeBridge();let socket:net.Socket|undefined;
 try {
  await bridge.listen(directory);
  const [pipe,token]=fs.readFileSync(path.join(directory,'browser-agent-bridge.txt'),'utf8').trim().split('\n');
  const ready=bridge.waitForConnection('returning-profile',500);
  expect(await bridge.waitForConnection('different-profile',5)).toBe(false);
  socket=net.connect('\\\\.\\pipe\\'+pipe);socket.setEncoding('utf8');
  socket.write('AUTH '+token+'\n'+JSON.stringify({type:'hello',profileId:'returning-profile'})+'\n');
  expect(await ready).toBe(true);
  const commands:string[]=[];socket.on('data',data=>commands.push(String(data)));
  const result=bridge.request('returning-profile',{operation:'click'});
  const failed=expect(result).rejects.toThrow('Outcome may be unknown');
  for(let i=0;i<50&&!commands.length;i++)await sleep(5);
  expect(commands).toHaveLength(1);socket.destroy();await failed;
  expect(bridge.status()).toMatchObject({state:'disconnected',connectedProfiles:0});
  const waiting=bridge.waitForConnection('returning-profile',1000);bridge.close();
  expect(await waiting).toBe(false);expect(commands).toHaveLength(1);
 }finally{socket?.destroy();bridge.close();fs.rmSync(directory,{recursive:true,force:true});}
});
it('authenticates fragmented native-host frames, correlates results and fails on disconnect without replay', async () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ally-browser-test-'));
  const bridge=new ChromeBridge(); let socket: net.Socket | undefined;
  try {
    await bridge.listen(directory);
    const [pipe,token]=fs.readFileSync(path.join(directory,'browser-agent-bridge.txt'),'utf8').trim().split('\n');
    const rejected=net.connect('\\\\.\\pipe\\'+pipe); rejected.on('error',()=>{}); rejected.write('AUTH wrong\n');
    await new Promise(resolve=>rejected.once('close',resolve)); expect(bridge.list()).toEqual([]);
    socket=net.connect('\\\\.\\pipe\\'+pipe); socket.setEncoding('utf8');
    socket.write('AUTH '+token.slice(0,20)); socket.write(token.slice(20)+'\r\n'+JSON.stringify({type:'hello',profileId:'fixture-profile'})+'\r\n');
    for(let i=0;i<30&&!bridge.list().length;i++)await sleep(10);
    expect(bridge.list()).toEqual([{profileId:'fixture-profile',connected:true}]);
    const incoming=new Promise<any>(resolve=>socket!.once('data',data=>resolve(JSON.parse(String(data)))));
    const result=bridge.request('fixture-profile',{operation:'tabs',task:'fixture'});
    const command=await incoming; expect(command.type).toBe('command');
    socket.write(JSON.stringify({type:'result',id:command.id,result:{tabs:[]}})+'\n');
    expect(await result).toEqual({tabs:[]});
    const pending=bridge.request('fixture-profile',{operation:'open',url:'https://example.com'});
    const check=expect(pending).rejects.toThrow('Outcome may be unknown'); socket.destroy(); await check;
    expect(bridge.list()).toEqual([]);
  } finally { socket?.destroy();bridge.close();fs.rmSync(directory,{recursive:true,force:true}); }
});
