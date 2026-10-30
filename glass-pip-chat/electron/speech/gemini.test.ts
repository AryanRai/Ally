import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import { geminiLiveUrl, recognizeGeminiLive } from './gemini';
const settings = { cloud: true, project: 'orbit-test-project', voice: 'en-AU-Chirp3-HD-Aoede', notifications: true, cloudProvider: 'gemini' as const };
function socket() { return Object.assign(new EventEmitter(), { readyState: 1, bufferedAmount: 0, send: vi.fn(), close: vi.fn() }); }
afterEach(() => vi.useRealTimers());
it('uses a fixed Vertex endpoint with project-scoped models, never API keys in URLs', () => {
  expect(geminiLiveUrl(settings)).toBe('wss://aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent');
  expect(() => geminiLiveUrl({ ...settings, project: '../other' })).toThrow();
  expect(() => geminiLiveUrl({ ...settings, geminiLocation: 'attacker.invalid' as any })).toThrow();
});
it('queues initial audio until ready, previews hypotheses and commits only finalized words', async () => {
  const ws = socket(), events: any[] = [];
  const mic = recognizeGeminiLive(settings, e => events.push(e), async () => ws as unknown as WebSocket);
  mic.write(Buffer.alloc(3200)); mic.end(); await Promise.resolve();
  expect(ws.send).toHaveBeenCalledTimes(1);
  const setup = JSON.parse(ws.send.mock.calls[0][0]).setup;
  expect(setup.generationConfig.responseModalities).toEqual(['TEXT']);
  expect(setup.model).toContain('projects/orbit-test-project/locations/global/');
  expect(setup.realtimeInputConfig.automaticActivityDetection.disabled).toBe(true);
  ws.emit('message', Buffer.from(JSON.stringify({ setupComplete: {} })));
  const writes = ws.send.mock.calls.map(([raw]) => JSON.parse(raw));
  expect(writes[1]).toEqual({ realtimeInput: { activityStart: {} } });
  expect(writes[2].realtimeInput.audio.mimeType).toBe('audio/pcm;rate=16000');
  expect(writes[3]).toEqual({ realtimeInput: { activityEnd: {} } });
  ws.emit('message', Buffer.from(JSON.stringify({ serverContent: { interimInputTranscription: { text: 'wrong' } } })));
  ws.emit('message', Buffer.from(JSON.stringify({ serverContent: { inputTranscription: { text: 'Right.' }, generationComplete: true } })));
  ws.emit('message', Buffer.from(JSON.stringify({ serverContent: { inputTranscription: { text: 'late' }, turnComplete: true } })));
  expect(events).toEqual([{ type: 'transcript', text: 'wrong', final: false }, { type: 'transcript', text: 'Right.', final: true }, { type: 'complete', text: 'Right.' }]);
});
it('does not finalize before release, or promote interim hypotheses into a completed request', async () => {
  const ws = socket(), emit = vi.fn();
  const mic = recognizeGeminiLive(settings, emit, async () => ws as unknown as WebSocket); await Promise.resolve();
  ws.emit('message', Buffer.from('{"setupComplete":{}}'));
  ws.emit('message', Buffer.from('{"serverContent":{"interimInputTranscription":{"text":"preview only"},"turnComplete":true}}'));
  expect(emit.mock.calls.some(([e]) => e.type === 'complete')).toBe(false);
  mic.end(); ws.emit('message', Buffer.from('{"serverContent":{"turnComplete":true}}'));
  expect(emit).toHaveBeenLastCalledWith({ type: 'complete', text: '' });
});
it('cancels before authentication finishes and never accepts late text', async () => {
  const ws = socket(), emit = vi.fn(); let resolve!: (ws: WebSocket) => void;
  const mic = recognizeGeminiLive(settings, emit, () => new Promise(r => { resolve = r; }));
  mic.cancel(); resolve(ws as unknown as WebSocket); await Promise.resolve();
  expect(ws.close).toHaveBeenCalledOnce(); expect(ws.send).not.toHaveBeenCalled(); expect(emit).not.toHaveBeenCalled();
});
it('bounds audio and sanitizes upstream errors, with a single terminal event', async () => {
  const ws = socket(), emit = vi.fn();
  const mic = recognizeGeminiLive(settings, emit, async () => ws as unknown as WebSocket); await Promise.resolve();
  ws.emit('message', Buffer.from('{"error":{"message":"private credentials should not escape"}}'));
  ws.emit('error', Error('raw secret')); mic.write(Buffer.alloc(3));
  expect(emit).toHaveBeenCalledOnce(); expect(JSON.stringify(emit.mock.calls)).not.toContain('private credentials');
  const invalid = vi.fn(); const next = recognizeGeminiLive(settings, invalid, async () => socket() as unknown as WebSocket);
  next.write(Buffer.alloc(3)); expect(invalid).toHaveBeenCalledWith({ type: 'error', error: 'Live audio limit exceeded.' });
});
it('times out without manufacturing a completed transcript', async () => {
  vi.useFakeTimers(); const emit = vi.fn();
  recognizeGeminiLive(settings, emit, () => new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(80_001);
  expect(emit).toHaveBeenCalledOnce(); expect(emit.mock.calls[0][0].type).toBe('error');
});
