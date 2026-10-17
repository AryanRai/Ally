// Synthetic speech only; never opens a microphone or submits an agent message.
import fs from 'node:fs';
import path from 'node:path';
import { synthesizeLive, recognizeLive } from '../dist/electron/speech/streaming.js';
const settings = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'glass-pip-chat/speech-settings.json'), 'utf8'));
const audio = []; let firstAudioMs = 0; const start = Date.now();
await synthesizeLive(settings, 'This is a live speech test. I am speaking from my watch. Please show the words as I speak, and let me stop the reply whenever I want.', settings.voice, bytes => { firstAudioMs ||= Date.now() - start; audio.push(bytes); }, new AbortController().signal);
const pcm = Buffer.concat(audio);
const samples = Buffer.alloc(Math.floor(pcm.length / 3) * 2);
for (let i = 0; i < samples.length / 2; i++) samples.writeInt16LE(pcm.readInt16LE(Math.floor(i * 1.5) * 2), i * 2);
let partials = 0; let beforeEnd = 0; let ended = false;
const complete = new Promise((resolve, reject) => {
  const stream = recognizeLive(settings, event => {
    if (event.type === 'transcript') { if (!event.final) partials++; if (!ended) beforeEnd++; }
    if (event.type === 'complete') resolve(event.text);
    if (event.type === 'error') reject(new Error(event.error));
  });
  void (async () => {
    for (let i = 0; i < samples.length; i += 3200) { stream.write(samples.subarray(i, i + 3200)); await new Promise(r => setTimeout(r, 100)); }
    ended = true; stream.end();
  })().catch(reject);
});
const text = await complete;
console.log(JSON.stringify({ firstAudioMs, partials, transcriptEventsBeforeEnd: beforeEnd, text }));
