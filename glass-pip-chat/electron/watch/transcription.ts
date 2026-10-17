import type { IncomingMessage } from 'node:http';
import { ensureSpeechRuntime } from '../speech/runtime.js';

/** Called only after bridge authentication. Transcription never creates an agent turn. */
export async function transcribeAudioRequest(req: IncomingMessage): Promise<{ status: number; body: unknown }> {
  const maximum = 1_920_044;
  if (req.headers['content-type'] !== 'audio/wav') return { status: 415, body: { error: 'Expected WAV audio' } };
  if (Number(req.headers['content-length']) > maximum) return { status: 413, body: { error: 'Voice section is too long' } };
  const parts: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximum) return { status: 413, body: { error: 'Voice section is too long' } };
    parts.push(chunk);
  }
  const audio = Buffer.concat(parts);
  if (audio.length < 6444 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') return { status: 400, body: { error: 'Record a little longer' } };
  const runtime = await ensureSpeechRuntime();
  const response = await fetch(`${runtime.url}/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'audio/wav' }, body: new Uint8Array(audio), signal: AbortSignal.timeout(120000) });
  const data = await response.json() as { text?: string; error?: string };
  return response.ok ? { status: 200, body: { text: data.text ?? '' } } : { status: 503, body: { error: data.error ?? 'Local transcription unavailable' } };
}
