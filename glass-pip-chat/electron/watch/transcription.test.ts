// @vitest-environment node
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
const runtime = vi.hoisted(() => vi.fn(async () => ({ url: 'http://local-speech', token: 'test-only' })));
vi.mock('../speech/runtime.js', () => ({ ensureSpeechRuntime: runtime }));
import { transcribeAudioRequest } from './transcription';
const request = (chunks: Buffer[], headers: Record<string, string> = { 'content-type': 'audio/wav' }) => Object.assign(Readable.from(chunks), { headers }) as unknown as IncomingMessage;
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('rejects invalid and oversized recordings before starting speech', async () => {
  expect((await transcribeAudioRequest(request([], { 'content-type': 'text/plain' }))).status).toBe(415);
  expect((await transcribeAudioRequest(request([Buffer.alloc(1_920_045)]))).status).toBe(413);
  expect((await transcribeAudioRequest(request([Buffer.alloc(6444)]))).status).toBe(400);
  expect(runtime).not.toHaveBeenCalled();
});
it('returns only transcript text and reports fallback failure', async () => {
  const audio = Buffer.alloc(6444); audio.write('RIFF'); audio.write('WAVE', 8);
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'My complete voice message', privateField: 'omit' }) })
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Speech worker unavailable' }) });
  vi.stubGlobal('fetch', fetch);
  expect(await transcribeAudioRequest(request([audio]))).toEqual({ status: 200, body: { text: 'My complete voice message' } });
  expect(await transcribeAudioRequest(request([audio]))).toEqual({ status: 503, body: { error: 'Speech worker unavailable' } });
  expect(fetch).toHaveBeenCalledWith('http://local-speech/transcribe', expect.objectContaining({ method: 'POST', body: new Uint8Array(audio) }));
});
