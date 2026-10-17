import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { recognizeLive, synthesizeLive, type Recognition } from '../speech/streaming.js';
import { speechSettings } from '../speech/settings.js';

/** Only microphone/audio transport. It cannot send messages or make agent decisions. */
export function attachSpeechSocket(server: Server, authorize: (header?: string) => boolean): () => void {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 24_000 });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/v1/speech/live' || request.headers.origin || !authorize(request.headers.authorization) || sockets.clients.size >= 4) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws));
  });
  sockets.on('connection', ws => {
    let recognition: Recognition | undefined; let started = false;
    const controller = new AbortController();
    const send = (value: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); };
    const timer = setTimeout(() => ws.close(1000, 'Speech session ended'), 90_000);
    ws.on('close', () => { clearTimeout(timer); recognition?.cancel(); controller.abort(); });
    ws.on('error', () => ws.close());
    ws.on('message', (data, binary) => {
      try {
        if (binary) { if (!recognition) throw new Error('Start recording first.'); recognition.write(Buffer.from(data as Buffer)); return; }
        const request = JSON.parse(data.toString());
        if (request.type === 'end') { recognition?.end(); return; }
        if (started) throw new Error('One speech operation per connection.');
        started = true;
        if (request.type === 'listen') {
          recognition = recognizeLive(speechSettings(), event => { send(event); if (event.type === 'complete' || event.type === 'error') ws.close(); });
          send({ type: 'ready' });
        } else if (request.type === 'speak' && typeof request.text === 'string') {
          const settings = speechSettings(); send({ type: 'format', sampleRate: 24000 });
          void synthesizeLive(settings, request.text, settings.voice, bytes => {
            if (ws.bufferedAmount > 2_000_000) { controller.abort(); return; }
            if (ws.readyState === WebSocket.OPEN) ws.send(bytes);
          }, controller.signal).then(() => { send({ type: 'complete' }); ws.close(); }, () => { send({ type: 'error', error: 'Cloud voice unavailable. Using watch speech.' }); ws.close(); });
        } else throw new Error('Invalid speech operation.');
      } catch (error) { send({ type: 'error', error: (error as Error).message }); ws.close(); }
    });
  });
  return () => { sockets.clients.forEach(ws => ws.terminate()); sockets.close(); };
}
