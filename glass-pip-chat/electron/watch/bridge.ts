import { recordActivity, settleActivity, type ActivityState } from './activity.js';
import { app } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { startAgentRun, stopAgentRun } from '../agent/runner.js';
import type { AgentConfig, AgentProvider } from '../agent/types.js';
import { parseWatchReply, WATCH_INSTRUCTIONS, type WatchReply } from './protocol.js';
import { ensureSpeechRuntime, getSpeechRuntimeStatus } from '../speech/runtime.js';

interface BridgeConfig { enabled: boolean; token: string; port: number; sessions: Partial<Record<AgentProvider, string>> }
interface Turn extends ActivityState { id: string; requestId: string; provider: AgentProvider; status: 'thinking' | 'done' | 'error'; activity: string; transcript: string; reply?: WatchReply; error?: string; runId?: string; startedAt: number }
const MAX_AUDIO = 1_920_044; // 60 seconds of 16 kHz mono PCM plus WAV header.

export function authorized(header: string | undefined, token: string): boolean {
  const a = Buffer.from(header ?? '');
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Opt-in localhost bridge. ADB reverse supplies the encrypted device transport in development. */
export function startWatchBridge(getConfig: () => AgentConfig): (() => void) | undefined {
  const file = path.join(app.getPath('userData'), 'watch-bridge.json');
  let config: BridgeConfig = { enabled: false, token: randomBytes(32).toString('hex'), port: 18765, sessions: {} };
  try { config = { ...config, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first start */ }
  if (process.env.ALLY_WATCH_ENABLED === '1') config.enabled = true;
  if (!config.enabled) return;
  const save = () => fs.writeFileSync(file, JSON.stringify(config, null, 2));
  save();
  const turns = new Map<string, Turn>();
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  // Warm the shared model without opening either microphone.
  void ensureSpeechRuntime().catch(() => { /* /v1/status exposes the actionable worker state. */ });
  let closed = false;
  const finish = (turn: Turn, error?: string, raw?: string) => {
    if (turn.status !== 'thinking') return;
    clearTimeout(timeouts.get(turn.id)); timeouts.delete(turn.id);
    turn.status = error ? 'error' : 'done';
    settleActivity(turn);
    turn.activity = error ? 'Try again' : 'Response ready';
    turn.error = error;
    if (!error) turn.reply = parseWatchReply(raw ?? '');
  };
  const run = async (turn: Turn) => {
    if (closed || turn.status !== 'thinking') return;
    const agent = getConfig();
    let output = '';
    turn.activity = 'Thinking…';
    try {
      const runId = await startAgentRun({ provider: turn.provider, cwd: agent.defaultCwd, permission: 'readonly',
        sessionId: config.sessions[turn.provider],
        prompt: `${WATCH_INSTRUCTIONS}\n\nUser message:\n${turn.transcript}`,
      }, (_, event) => {
        if (closed || turn.status !== 'thinking') return;
        recordActivity(turn, event);
        if (event.kind === 'session') { config.sessions[turn.provider] = event.sessionId; save(); }
        if (event.kind === 'text') output = (output + event.text).slice(-64000);
        if (event.kind === 'tool_start') turn.activity = `Using ${event.name.slice(0, 70)}`;
        if (event.kind === 'done') finish(turn, event.isError ? event.error ?? 'Agent failed' : undefined, output);
      }, turn.provider === 'codex' ? agent.codexPath : agent.claudePath);
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
        send(res, 200, { connected: true, voiceAvailable: voice.ready, voiceState: voice.state, voiceDetail, providers: ['codex', 'claude'], context: 'Dedicated watch chat', permission: 'readonly' }); return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/v1/turns/')) {
        const turn = turns.get(url.pathname.slice('/v1/turns/'.length));
        send(res, turn ? 200 : 404, turn ?? { error: 'This response expired after the desktop restarted. Send your message again.' }); return;
      }
      if (req.method !== 'POST' || !['/v1/messages', '/v1/audio'].includes(url.pathname)) { send(res, 404, { error: 'Not found' }); return; }
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
      if (!['codex', 'claude'].includes(provider) || typeof requestId !== 'string' || !/^[\w-]{1,80}$/.test(requestId)) { send(res, 400, { error: 'Invalid engine or request ID' }); return; }
      const voiceReady = !audio || (await getSpeechRuntimeStatus()).ready;
      const previous = [...turns.values()].find(t => t.requestId === requestId && t.provider === provider);
      if (previous) { send(res, 202, { id: previous.id }); return; }
      if ([...turns.values()].some(t => t.provider === provider && t.status === 'thinking')) { send(res, 409, { error: 'Your watch chat is still working. Wait for its response.' }); return; }
      if (audio && (body.length < 6444 || body.toString('ascii', 0, 4) !== 'RIFF' || body.toString('ascii', 8, 12) !== 'WAVE')) { send(res, 400, { error: 'Record at least a moment of speech' }); return; }
      if (!voiceReady) { send(res, 503, { error: 'Voice is not ready. Reconnect speech on the desktop or use text.' }); return; }
      if (!audio && (typeof message.text !== 'string' || !message.text.trim() || message.text.length > 4000)) { send(res, 400, { error: 'Message must contain 1–4000 characters' }); return; }
      if (turns.size >= 100) {
        const oldest = [...turns.values()].find(t => t.status !== 'thinking');
        if (oldest) turns.delete(oldest.id);
      }
      const turn: Turn = { steps: [], id: randomUUID(), requestId, provider, status: 'thinking', activity: audio ? 'Transcribing…' : 'Thinking…', transcript: audio ? '' : message.text.trim(), startedAt: Date.now() };
      turns.set(turn.id, turn);
      timeouts.set(turn.id, setTimeout(() => { finish(turn, 'This request took too long. Please try again.'); if (turn.runId) stopAgentRun(turn.runId); }, 5 * 60_000));
      send(res, 202, { id: turn.id });
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
  server.maxConnections = 8;
  server.on('error', error => console.error('Watch bridge:', error.message));
  server.listen(config.port, '127.0.0.1', () => console.log(`Ally watch bridge listening on localhost:${config.port}`));
  return () => { closed = true; for (const timer of timeouts.values()) clearTimeout(timer); for (const t of turns.values()) if (t.status === 'thinking' && t.runId) stopAgentRun(t.runId); server.close(); server.closeAllConnections(); };
}
