// node scripts/profile-lifecycle.mjs <original-codexActivity.ts> <candidate-agent-directory> <output-directory>
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const [original, compiled, destination] = process.argv.slice(2);
if (!original || !compiled || !destination) throw Error('Pass baseline source, built candidate and output');
const out=path.resolve(destination);await fs.mkdir(out,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ally-lifecycle-profile-'));
try {
  const source=(await fs.readFile(original,'utf8')).replace("'./sessionActivity.js'",JSON.stringify(pathToFileURL(path.resolve(compiled,'sessionActivity.js')).href));
  await fs.writeFile(path.join(temp,'before.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  const before=(await import(pathToFileURL(path.join(temp,'before.mjs')).href)).readCodexActivity;
  const after=(await import(pathToFileURL(path.resolve(compiled,'codexActivity.js')).href)).readCodexActivity;
  const files=[];const now=Date.now();
  for(let i=0;i<128;i++) {
    const file=path.join(temp,`synthetic-${i}.jsonl`);files.push(file);
    const start=JSON.stringify({type:'event_msg',payload:{type:i%2?'task_complete':'task_started',turn_id:'synthetic-'+i}});
    // A long tool record puts some lifecycle markers outside the last64KiB.
    await fs.writeFile(file,start+'\n'+JSON.stringify({type:'response_item',output:'x'.repeat(i%16===0?600000:100)})+'\n');
  }
  const results=[];
  for(const [name,read] of [['before',before],['after',after]]) {
    let opens=0,bytes=0;const originalOpen=fs.open;
    fs.open=async(...args)=>{opens++;const handle=await originalOpen(...args);const originalRead=handle.read.bind(handle);handle.read=async(...args)=>{const result=await originalRead(...args);bytes+=result.bytesRead;return result;};return handle;};
    try {
      const samples=[];let hash;
      for(let poll=0;poll<3;poll++) {
        const initialOpens=opens,initialBytes=bytes,cpu=process.cpuUsage(),start=performance.now();const rows=[];
        for(const file of files) rows.push(await read(file,now));
        const duration=performance.now()-start,used=process.cpuUsage(cpu);
        const digest=createHash('sha256').update(JSON.stringify(rows.map(row=>row&&[row.turnId,row.pending,row.status,row.recent,row.updatedAt]))).digest('hex');
        if(hash&&digest!==hash)throw Error('Lifecycle changed between unchanged scans');hash=digest;
        samples.push({poll,ms:duration,cpuMs:(used.user+used.system)/1000,opens:opens-initialOpens,bytes:bytes-initialBytes});
      }
      results.push({name,hash,samples});
    }finally{fs.open=originalOpen;}
  }
  if(results[0].hash!==results[1].hash)throw Error('Baseline/candidate lifecycle mismatch');
  await fs.writeFile(path.join(out,'lifecycle.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await fs.rm(temp,{recursive:true,force:true});}
