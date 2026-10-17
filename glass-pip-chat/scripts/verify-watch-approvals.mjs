// Opt-in smoke test against the installed Codex app-server. No real upload or agent turn.
import http from 'node:http';
import assert from 'node:assert/strict';
import { CodexRpc } from '../dist/electron/agent/codexRpc.js';
import { WatchApprovals } from '../dist/electron/watch/approvals.js';
import { startUserQuestions } from '../dist/electron/agent/userQuestions.js';

let toolResponse;
let toolId;
let receivedDecision;
const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const msg = JSON.parse(Buffer.concat(chunks).toString());
  const reply = result => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })); };
  if (msg.method === 'initialize') reply({ protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'ally-approval-test', version: '1' } });
  else if (msg.method === 'tools/list') reply({ tools: [{ name: 'test_confirmation', description: 'Test approval protocol only; performs no external action', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false } }] });
  else if (msg.method === 'tools/call') {
    toolResponse = res; toolId = msg.id;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 'test-approval', method: 'elicitation/create', params: { mode: 'form', message: 'Test only: allow a simulated report upload? No file will be sent.', requestedSchema: { type: 'object', properties: { allow: { type: 'boolean', title: 'Allow simulated upload?' } }, required: ['allow'] } } })}\n\n`);
  } else if (msg.id === 'test-approval' && msg.result) {
    receivedDecision = msg.result;
    res.writeHead(202).end();
    toolResponse.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: toolId, result: { content: [{ type: 'text', text: 'Simulated approval answered; no action performed.' }] } })}\n\n`);
  } else if (msg.id != null) reply({}); else res.writeHead(202).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let rpc;
let questions;
try {
  rpc = await CodexRpc.connect();
  let count = 0;
  const queue = new WatchApprovals(() => {});
  questions = await startUserQuestions(async (method, params, signal) => {
    const waiting = queue.request('question-turn', method, params, signal);
    const prompt = queue.list('question-turn')[0];
    assert.equal(prompt.fields[0].label, 'Cancel this harmless test?');
    queue.answer('question-turn', prompt.id, { action: 'submit', values: { test: 'Cancel test' } });
    return await waiting;
  });
  rpc.onRequest = async (method, params) => {
    assert.equal(method, 'mcpServer/elicitation/request'); count++;
    const result = queue.request('test-turn', method, params, new AbortController().signal);
    const request = queue.list('test-turn')[0];
    assert.equal(request.fields[0].id, 'allow');
    queue.answer('test-turn', request.id, { action: 'decline' });
    return await result;
  };
  const { thread } = await rpc.request('thread/start', { ephemeral: true, cwd: process.cwd(), approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'read-only', config: { mcp_servers: { ally_watch: questions.config, ally_approval_test: { url: `http://127.0.0.1:${server.address().port}/mcp` } } } });
  await rpc.request('mcpServer/tool/call', { threadId: thread.id, server: 'ally_approval_test', tool: 'test_confirmation', arguments: {} }, 30000);
  assert.equal(count, 1); assert.equal(receivedDecision.action, 'decline');
  console.log('PASS: installed Codex forwarded an MCP approval; Ally returned the explicit denial correctly. No file uploaded.');
  const answer = await rpc.request('mcpServer/tool/call', { threadId: thread.id, server: 'ally_watch', tool: 'ask_user', arguments: { questions: [{ id: 'test', question: 'Cancel this harmless test?', options: ['Cancel test', 'Continue test'] }] } }, 30000);
  assert.ok(JSON.stringify(answer).includes('Cancel test'));
  console.log('PASS: installed Codex called the watch question tool and received the selected answer.');
} finally { questions?.close(); rpc?.close(); server.closeAllConnections(); server.close(); }
