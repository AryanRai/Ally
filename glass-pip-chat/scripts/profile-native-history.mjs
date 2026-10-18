// Read-only main-process V8 profile. No renderer, writer, microphone or capture.
// electron scripts/profile-native-history.mjs <session-id> <output-dir> [built-agent-dir]
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Session } from 'node:inspector';
import { createHash } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';

async function run() {
  const [id, destination, built = 'dist/electron/agent'] = process.argv.slice(2);
  if (!id || !destination) throw Error('Pass the exact read-only session ID and output directory');
  await app.whenReady();
  const output = path.resolve(destination); fs.mkdirSync(output, {recursive:true});
  const session = new Session(); session.connect();
  const post = method => new Promise((resolve,reject)=>session.post(method,(error,result)=>error?reject(error):resolve(result)));
  const history = await import(pathToFileURL(path.resolve(built,'codexHistory.js')).href);
  const delays = monitorEventLoopDelay({resolution:10}); delays.enable();
  const deadline = setTimeout(()=>{history.closeCodexHistory();app.exit(1)},90000);
  try {
    await post('Profiler.enable'); await post('Profiler.start');
    const start = performance.now(); const first = await history.loadCodexChat(id); const coldMs = performance.now()-start;
    const {profile} = await post('Profiler.stop');
    const metrics = {coldMs, messages:first.messages.length, eventLoopMaxMs:delays.max/1e6, eventLoopP99Ms:delays.percentile(99)/1e6,
      messageHash:createHash('sha256').update(JSON.stringify(first.messages)).digest('hex')};
    const cachedStart = performance.now(); const cached = await history.loadCodexChat(id,first.revision);
    Object.assign(metrics,{cachedMs:performance.now()-cachedStart,unchanged:cached.unchanged,cachedMessages:cached.messages.length});
    fs.writeFileSync(path.join(output,'main.cpuprofile'),JSON.stringify(profile));
    fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(metrics,null,2)); console.log(JSON.stringify(metrics));
  } finally { clearTimeout(deadline);delays.disable();history.closeCodexHistory();session.disconnect(); }
  app.exit(0);
}
void run().catch(error=>{console.error(error);app.exit(1)});
