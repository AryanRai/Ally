// Bounded, metadata-only live profile. No chat content, input, capture or model calls.
// node scripts/profile-glass-performance.cjs <output-directory> [seconds=8]
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
async function run() {
  const out = path.resolve(process.argv[2]); fs.mkdirSync(out, { recursive: true });
  const seconds = Math.max(1, Math.min(20, Number(process.argv[3] || 8)));
  const targets = await (await fetch('http://127.0.0.1:9229/json/list')).json();
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0; const pending = new Map();
  ws.on('message', b => { const m = JSON.parse(b); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } });
  const call = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  try {
    const state = await evaluate(`(async()=>{
      const e=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron');
      const windows=[];
      for(const w of e.BrowserWindow.getAllWindows()) windows.push({id:w.id,visible:w.isVisible(),bounds:w.getBounds(),renderer:await w.webContents.executeJavaScript('({hidden:document.hidden,canvases:[...document.querySelectorAll("canvas")].map(c=>({width:c.width,height:c.height,rect:{width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height}})),nodes:document.querySelectorAll("*").length,heap:performance.memory?.usedJSHeapSize})')});
      return {pid:process.pid,app:e.app.getAppPath(),memory:process.memoryUsage(),windows};
    })()`);
    fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(state, null, 2));
    await call('Profiler.enable'); await call('Profiler.start');
    const rendererProfiles = await evaluate(`(async()=>{
      const e=process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron');
      const result=[];
      for(const w of e.BrowserWindow.getAllWindows()) {
        const d=w.webContents.debugger;if(d.isAttached()) {result.push({id:w.id,skipped:'debugger already attached'});continue;}
        try {d.attach('1.3');await d.sendCommand('Profiler.enable');await d.sendCommand('Profiler.start');await new Promise(r=>setTimeout(r,${seconds * 1000}));const p=await d.sendCommand('Profiler.stop');result.push({id:w.id,profile:p.profile});}finally{if(d.isAttached())d.detach();}
      }return result;
    })()`);
    const main = await call('Profiler.stop');
    fs.writeFileSync(path.join(out, 'main.cpuprofile'), JSON.stringify(main.profile));
    for (const r of rendererProfiles) if (r.profile) fs.writeFileSync(path.join(out, `renderer-${r.id}.cpuprofile`), JSON.stringify(r.profile));
    function summarize(profile) {
      const counts = new Map(); for (const sample of profile.samples || []) counts.set(sample, (counts.get(sample) || 0) + 1);
      return profile.nodes.map(n => ({ name: n.callFrame.functionName, url: n.callFrame.url, line: n.callFrame.lineNumber + 1, samples: counts.get(n.id) || 0 })).sort((a,b) => b.samples-a.samples).slice(0,35);
    }
    const summary = {state,main:summarize(main.profile),renderers:rendererProfiles.map(r=>({id:r.id,top:r.profile?summarize(r.profile):r.skipped}))};
    fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));
    console.log(JSON.stringify(summary,null,2));
  } finally { await call('Profiler.disable').catch(()=>{}); ws.close(); }
}
run().catch(e => { console.error(e); process.exitCode=1; });
