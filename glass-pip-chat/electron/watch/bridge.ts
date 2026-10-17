import { recordActivity, settleActivity, type ActivityState } from './activity.js';
import { app } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { startAgentRun, stopAgentRun } from '../agent/runner.js';
import type { AgentConfig, AgentProvider, AgentPermission } from '../agent/types.js';
import { parseWatchReply, WATCH_INSTRUCTIONS, type WatchReply } from './protocol.js';
import { ensureSpeechRuntime, getSpeechRuntimeStatus } from '../speech/runtime.js';
import { WatchConversations, chatSummary } from './conversations.js';
import { listCodexChats, loadCodexChat } from '../agent/codexHistory.js';
import { listAgentSessions, loadAgentSession } from '../agent/sessions.js';
import { startWatchTransport, type WatchTransportConfig } from './transport.js';
import { startCloudTunnel, type CloudTunnelConfig } from './cloudTunnel.js';
import { WatchApprovals, watchPermission } from './approvals.js';
import { attachSpeechSocket } from './speechSocket.js';
import { speechSettings } from '../speech/settings.js';
import { notifyReply } from '../notifications.js';

interface BridgeConfig { enabled: boolean; token: string; port: number; sessions: Partial<Record<AgentProvider, string>>; transport?: WatchTransportConfig; cloudTunnel?: CloudTunnelConfig }
interface Turn extends ActivityState { chatId: string; id: string; requestId: string; provider: AgentProvider; permission: AgentPermission; status: 'thinking' | 'done' | 'error'; activity: string; transcript: string; reply?: WatchReply; error?: string; runId?: string; startedAt: number }
const MAX_AUDIO = 1_920_044; // 60 seconds of 16 kHz mono PCM plus WAV header.

export function authorized(header: string | undefined, token: string): boolean {
  const a = Buffer.from(header ?? '');
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Authenticated localhost bridge, reachable through an opt-in Cloudflare tunnel or development ADB. */
export function startWatchBridge(getConfig: () => AgentConfig): (() => void) | undefined {
  const file = path.join(app.getPath('userData'), 'watch-bridge.json');
  let config: BridgeConfig = { enabled: false, token: randomBytes(32).toString('hex'), port: 18765, sessions: {} };
  try { config = { ...config, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first start */ }
  if (process.env.ALLY_WATCH_ENABLED === '1') config.enabled = true;
  if (!config.enabled) return;
  const save = () => fs.writeFileSync(file, JSON.stringify(config, null, 2));
  save();
  const transport = config.transport?.serial && !config.cloudTunnel?.enabled ? startWatchTransport(config.transport, config.port, () => save()) : undefined;
  let stopCloudTunnel: (() => void) | undefined;
  const conversations = new WatchConversations(path.join(app.getPath('userData'), 'watch-chats.json'), {
    list: async (provider, limit) => provider === 'codex' ? listCodexChats(limit) : listAgentSessions(provider, limit),
    load: async (provider, id) => provider === 'codex' ? loadCodexChat(id) : loadAgentSession(provider, id),
  }, config.sessions, getConfig().defaultCwd);
  const turns = new Map<string, Turn>();
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  // Warm the shared model without opening either microphone.
  void ensureSpeechRuntime().catch(() => { /* /v1/status exposes the actionable worker state. */ });
  let closed = false;
  const armTimeout = (turn: Turn) => {
    clearTimeout(timeouts.get(turn.id));
    timeouts.set(turn.id, setTimeout(() => { finish(turn, 'This request took too long. Please try again.'); if (turn.runId) stopAgentRun(turn.runId); }, 5 * 60_000));
  };
  const approvals = new WatchApprovals(id => {
    const turn = turns.get(id); if (!turn || turn.status !== 'thinking' || closed) return;
    if (approvals.list(id).length) { clearTimeout(timeouts.get(id)); timeouts.delete(id); turn.activity = 'Waiting for your approval'; }
    else { turn.activity = 'Continuing…'; armTimeout(turn); }
  });
  const finish = (turn: Turn, error?: string, raw?: string) => {
    if (turn.status !== 'thinking') return;
    clearTimeout(timeouts.get(turn.id)); timeouts.delete(turn.id);
    turn.status = error ? 'error' : 'done';
    approvals.cancel(turn.id);
    settleActivity(turn);
    turn.activity = error ? 'Try again' : 'Response ready';
    turn.error = error;
    if (!error) turn.reply = parseWatchReply(raw ?? '');
    void conversations.get(turn.chatId).then(chat => notifyReply({ id: turn.id, title: error ? 'Ally needs attention' : 'Watch reply ready', text: error || turn.reply?.text || '', session: chat.sessionId ? { id: chat.sessionId, provider: chat.provider, title: chat.title, cwd: chat.cwd } : undefined })).catch(() => {});
    void conversations.get(turn.chatId).then(chat => conversations.record(chat, turn.transcript, turn.reply ?? { text: error ?? 'Stopped', components: [] }, turn, turn.id)).catch(error => console.error('Watch history:', error.message));
  };
  const run = async (turn: Turn) => {
    if (closed || turn.status !== 'thinking') return;
    const agent = getConfig();
    const chat = await conversations.get(turn.chatId);
    let output = '';
    turn.activity = 'Thinking…';
    try {
      const runId = await startAgentRun({ provider: turn.provider, cwd: chat.cwd || agent.defaultCwd, permission: turn.permission,
        sessionId: chat.sessionId,
        codexDesktop: agent.codexDesktop === true,
        prompt: `${WATCH_INSTRUCTIONS}\n${turn.provider === 'codex' ? 'Ally can display real tool approval requests and questions on the watch. Use the supported approval or user-input mechanism when needed; never manufacture approval buttons in reply components or claim permission was granted without a user decision. If a request was already rejected, explain that no approval is pending; do not claim an Allow prompt exists on the PC.' : 'Claude uses the selected CLI permission mode; interactive approval forwarding is not available in this client.'}\n\nUser message:\n${turn.transcript}`,
      }, (_, event) => {
        if (closed || turn.status !== 'thinking') return;
        recordActivity(turn, event);
        if (event.kind === 'session') conversations.link(chat, event.sessionId);
        if (event.kind === 'text') output = (output + event.text).slice(-64000);
        if (event.kind === 'tool_start') turn.activity = `Using ${event.name.slice(0, 70)}`;
        if (event.kind === 'done') finish(turn, event.isError ? event.error ?? 'Agent failed' : undefined, output);
      }, turn.provider === 'codex' ? agent.codexPath : agent.claudePath,
      turn.provider === 'codex' ? (method, params, signal) => approvals.request(turn.id, method, params, signal) : undefined);
      turn.runId = runId;
      if (closed || turns.get(turn.id)?.status === 'error') stopAgentRun(runId);
    } catch (error) { finish(turn, error instanceof Error ? error.message : 'Agent unavailable'); }
  };
  const send = (res: http.ServerResponse, code: number, value: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.origin || !authorized(req.headers.authorization, config.token)) { send(res, 401, { error: 'Pair Ally from the desktop first' }); return; }
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/v1/status') {
        const voice = await getSpeechRuntimeStatus();
        const voiceDetail = voice.ready ? 'Hold to talk' : voice.state === 'loading' || voice.state === 'starting' ? 'Voice model loading · text ready' : 'Voice unavailable · reconnect on desktop';
        send(res, 200, { connected: true, voiceAvailable: speechSettings().cloud || voice.ready, liveSpeech: speechSettings().cloud, voiceState: voice.state, voiceDetail, providers: ['codex', 'claude'], context: 'Selected chat', permission: 'per-chat', approvals: ['codex'] }); return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/chats') {
        const provider = url.searchParams.get('provider');
        if (provider !== 'codex' && provider !== 'claude') { send(res, 400, { error: 'Choose an engine' }); return; }
        const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
        send(res, 200, await conversations.list(provider, offset)); return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/v1/chats/')) {
        const chat = await conversations.get(decodeURIComponent(url.pathname.slice('/v1/chats/'.length)));
        const active = [...turns.values()].find(t => t.chatId === chat.id && t.status === 'thinking');
        const messages = active ? chat.messages : await conversations.history(chat);
        const before = url.searchParams.has('before') ? Math.max(0, Math.min(messages.length, Number(url.searchParams.get('before')) || 0)) : messages.length;
        const start = Math.max(0, before - 30);
        send(res, 200, { chat: chatSummary(chat), messages: messages.slice(start, before), before: start > 0 ? start : null, activeTurnId: active?.id }); return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/v1/turns/')) {
        const turn = turns.get(url.pathname.slice('/v1/turns/'.length));
        send(res, turn ? 200 : 404, turn ? { ...turn, approvals: approvals.list(turn.id) } : { error: 'This response expired after the desktop restarted. Check chat history before sending again.' }); return;
      }
      const approvalRoute = req.method === 'POST' && /^\/v1\/turns\/([^/]+)\/approvals\/([^/]+)$/.exec(url.pathname);
      if (approvalRoute) {
        const turn = turns.get(approvalRoute[1]);
        if (!turn || turn.status !== 'thinking') { send(res, 409, { error: 'This turn is no longer waiting' }); return; }
        const parts: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 16000) { send(res, 413, { error: 'Answer too large' }); return; } parts.push(chunk); }
        try { approvals.answer(turn.id, approvalRoute[2], JSON.parse(Buffer.concat(parts).toString())); send(res, 200, { accepted: true }); }
        catch (error) { send(res, 409, { error: error instanceof Error ? error.message : 'Invalid approval answer' }); }
        return;
      }
      if (req.method !== 'POST' || !['/v1/messages', '/v1/audio', '/v1/chats'].includes(url.pathname)) { send(res, 404, { error: 'Not found' }); return; }
      const audio = url.pathname === '/v1/audio';
      const limit = audio ? MAX_AUDIO : 16000;
      if (Number(req.headers['content-length']) > limit) { send(res, 413, { error: 'Recording too long' }); req.resume(); return; }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) { send(res, 413, { error: 'Request too large' }); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      let message: any = {};
      if (!audio) { try { message = JSON.parse(body.toString()); } catch { send(res, 400, { error: 'Invalid JSON' }); return; } }
      const provider = audio ? url.searchParams.get('provider') : message.provider;
      const requestId = audio ? url.searchParams.get('requestId') : message.requestId;
      let permission: AgentPermission;
      try { permission = watchPermission(audio ? url.searchParams.get('permission') : message.permission); }
      catch { send(res, 400, { error: 'Invalid chat permission' }); return; }
      if (!['codex', 'claude'].includes(provider) || typeof requestId !== 'string' || !/^[\w-]{1,80}$/.test(requestId)) { send(res, 400, { error: 'Invalid engine or request ID' }); return; }
      if (url.pathname === '/v1/chats') {
        send(res, 200, { chat: chatSummary(conversations.create(provider, getConfig().defaultCwd, requestId)) }); return;
      }
      const requestedChat = audio ? url.searchParams.get('chatId') : message.chatId;
      const chat = requestedChat ? await conversations.get(String(requestedChat)) : config.sessions[provider as AgentProvider]
        ? await conversations.get(`${provider}:${config.sessions[provider as AgentProvider]}`)
        : conversations.create(provider, getConfig().defaultCwd, `legacy-${provider}`);
      if (chat.provider !== provider) { send(res, 400, { error: 'The selected chat uses a different engine. Select it again.' }); return; }
      const voiceReady = !audio || (await getSpeechRuntimeStatus()).ready;
      const previous = [...turns.values()].find(t => t.requestId === requestId && t.chatId === chat.id);
      if (previous) { send(res, 202, { id: previous.id }); return; }
      if ([...turns.values()].some(t => t.chatId === chat.id && t.status === 'thinking')) { send(res, 409, { error: 'Your watch chat is still working. Wait for its response.' }); return; }
      if (audio && (body.length < 6444 || body.toString('ascii', 0, 4) !== 'RIFF' || body.toString('ascii', 8, 12) !== 'WAVE')) { send(res, 400, { error: 'Record at least a moment of speech' }); return; }
      if (!voiceReady) { send(res, 503, { error: 'Voice is not ready. Reconnect speech on the desktop or use text.' }); return; }
      if (!audio && (typeof message.text !== 'string' || !message.text.trim() || message.text.length > 4000)) { send(res, 400, { error: 'Message must contain 1–4000 characters' }); return; }
      if (turns.size >= 100) {
        const oldest = [...turns.values()].find(t => t.status !== 'thinking');
        if (oldest) turns.delete(oldest.id);
      }
      const turn: Turn = { chatId: chat.id, steps: [], id: randomUUID(), requestId, provider, permission, status: 'thinking', activity: audio ? 'Transcribing…' : 'Thinking…', transcript: audio ? '' : message.text.trim(), startedAt: Date.now() };
      turns.set(turn.id, turn);
      armTimeout(turn);
      send(res, 202, { id: turn.id, chatId: chat.id });
      if (!audio) { void run(turn); return; }
      void (async () => {
        try {
          const runtime = await ensureSpeechRuntime();
          const response = await fetch(`${runtime.url}/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/wav', Authorization: `Bearer ${runtime.token}` }, body: new Uint8Array(body), signal: AbortSignal.timeout(120000) });
          const data = await response.json() as { text?: string; error?: string };
          if (!response.ok || !data.text?.trim()) throw new Error(data.error ?? 'No speech heard. Try again or use text.');
          turn.transcript = data.text.trim().slice(0, 4000);
          await run(turn);
        } catch (error) { finish(turn, error instanceof Error ? `Voice: ${error.message}` : 'Voice service unavailable. Use text for now.'); }
      })();
    } catch (error) { if (!res.headersSent) send(res, 500, { error: error instanceof Error ? error.message : 'Bridge error' }); }
  });
  server.requestTimeout = 15000;
  const stopSpeech = attachSpeechSocket(server, header => authorized(header, config.token));
  server.maxConnections = 8;
  server.on('error', error => console.error('Watch bridge:', error.message));
  server.listen(config.port, '127.0.0.1', () => {
    console.log(`Ally watch bridge listening on localhost:${config.port}`);
    if (!closed && config.cloudTunnel) stopCloudTunnel = startCloudTunnel(config.cloudTunnel, app.getPath('userData'));
  });
  return () => { closed = true; stopSpeech(); stopCloudTunnel?.(); transport?.stop(); for (const timer of timeouts.values()) clearTimeout(timer); for (const t of turns.values()) { approvals.cancel(t.id); if (t.status === 'thinking' && t.runId) stopAgentRun(t.runId); } server.close(); server.closeAllConnections(); };
}
