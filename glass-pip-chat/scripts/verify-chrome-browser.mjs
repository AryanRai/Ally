// Opt-in live test: real Ally runner + native Chrome tools, isolated local fixture.
// No email, private file upload, browser security changes, or external writes.
// Optional ALLY_BROWSER_TEST_THREAD continues an explicitly authorized existing chat.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { runCodexTurn } from '../dist/electron/agent/codexRun.js';
import { ALLY_BROWSER_INSTRUCTIONS } from '../dist/electron/agent/browserContext.js';

const nonce = randomUUID();
const marker = `Ally synthetic browser fixture ${nonce}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-chrome-check-'));
const file = path.join(dir, 'synthetic-upload.txt');
fs.writeFileSync(file, marker);
const observed = { page: false, form: false, upload: false };
const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/' + nonce)) { res.writeHead(404).end(); return; }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.writeHead(413).end(); return; } }
    if (req.url === `/${nonce}/form`) observed.form = body === 'Chrome from Ally works';
    if (req.url === `/${nonce}/upload`) observed.upload = body === marker;
    res.end('Verified'); return;
  }
  observed.page = true;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="en"><title>Ally Chrome check</title>
  <style>body{font:18px system-ui;margin:60px;max-width:700px}input,button{font:inherit;padding:12px;margin:8px 0}label{display:block}output{display:block;padding:12px;color:green}</style>
  <h1>Ally native Chrome connection</h1><p>This local test uses synthetic data only.</p>
  <label>Test phrase <input id="phrase"></label><button id="verify">Verify phrase</button><output id="formResult"></output>
  <label>Dummy attachment <input type="file" id="attachment"></label><output id="fileResult"></output>
  <script>
  document.querySelector('#verify').onclick=async()=>{await fetch('./${nonce}/form',{method:'POST',body:document.querySelector('#phrase').value});document.querySelector('#formResult').textContent='Phrase checked'};
  document.querySelector('#attachment').onchange=async(e)=>{await fetch('./${nonce}/upload',{method:'POST',body:await e.target.files[0].text()});document.querySelector('#fileResult').textContent='Dummy file received'};
  </script></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/${nonce}`;
const prompt = `Only perform this Ally browser connection diagnostic; do NOT continue earlier email tasks. Use native cua_repl tools with Chrome. Open ${url} in a new tab, sessionName '🔎 Ally Chrome check'. Read the page and enter 'Chrome from Ally works' in Test phrase; click Verify phrase. Then use the supported file-upload API to attach ONLY the synthetic file ${file} to Dummy attachment on that same local test page. This explicitly authorizes uploading that generated dummy file to this localhost test server only; no private files or external uploads. Read the file-upload documentation first. Do not change any browser security settings or work around a rejected upload. If blocked, report the exact error. Use only native browser tools for page interactions, no shell/HTTP calls or injected scripts. Verify the visible result, close only your test tab, and report concisely.`;
let active;
async function runThroughWatch() {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'glass-pip-chat', 'watch-bridge.json'), 'utf8'));
  const base = `http://127.0.0.1:${config.port}`;
  const headers = { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' };
  const response = await fetch(base + '/v1/messages', { method: 'POST', headers, body: JSON.stringify({
    provider: 'codex', permission: 'readonly', chatId: process.env.ALLY_BROWSER_TEST_WATCH_CHAT,
    requestId: nonce, text: 'The user explicitly approved retrying this synthetic upload after the earlier denial.\n' + prompt,
  }) });
  const start = await response.json();
  if (!response.ok) throw new Error(start.error ?? 'Watch request failed');
  console.log('Watch turn: ' + start.id);
  const shown = new Set();
  for (;;) {
    const state = await (await fetch(base + '/v1/turns/' + start.id, { headers })).json();
    for (const approval of state.approvals ?? []) if (!shown.has(approval.id)) {
      shown.add(approval.id); console.log('PENDING HUMAN APPROVAL: ' + JSON.stringify(approval));
    }
    if (state.status !== 'thinking') { console.log(JSON.stringify(state.reply ?? state.error)); return { isError: state.status === 'error', error: state.error }; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
try {
  console.log('Testing real Ally Codex runner, native Chrome, local synthetic form/upload.');
  const result = process.env.ALLY_BROWSER_TEST_WATCH_CHAT ? await runThroughWatch() : await new Promise(resolve => {
    const timer = setTimeout(() => { console.log('Diagnostic timed out; stopping.'); active.stop(); }, 180000);
    active = runCodexTurn({ provider: 'codex', cwd: process.cwd(), permission: 'readonly',
      sessionId: process.env.ALLY_BROWSER_TEST_THREAD, ephemeral: !process.env.ALLY_BROWSER_TEST_THREAD,
      // Also exercise the production browser instructions for an ephemeral test.
      robot: process.env.ALLY_BROWSER_TEST_THREAD ? undefined : { instructions: ALLY_BROWSER_INSTRUCTIONS }, prompt,
    }, ev => {
      if (ev.kind === 'text') process.stdout.write(ev.text);
      if (ev.kind === 'tool_start') console.log(`\nTOOL ${ev.name}`);
      if (ev.kind === 'tool_end' && ev.isError) console.log(`ERROR ${String(ev.output).slice(0,1800)}`);
      if (ev.kind === 'done') { clearTimeout(timer); resolve(ev); }
    });
  });
  console.log('\nObserved by test server: ' + JSON.stringify(observed));
  assert.equal(result.isError, false, result.error);
  assert.equal(observed.page, true, 'Chrome did not load the fixture');
  assert.equal(observed.form, true, 'Browser did not submit the expected test phrase');
  assert.equal(observed.upload, true, 'Native upload did not deliver the synthetic file');
  console.log('PASS: native Chrome opened, filled, clicked, and uploaded through Ally.');
} finally {
  server.closeAllConnections(); server.close();
  fs.unlinkSync(file); fs.rmdirSync(dir);
}
