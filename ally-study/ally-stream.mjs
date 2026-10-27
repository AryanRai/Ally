import {nativeConversationCode} from './ally-native-conversation.mjs';

// The native turn follows the same Ally agent run over one authenticated stream.
export async function readNativeEvents(response, {signal, onText = () => {}} = {}) {
  if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) throw Error('Update Ally desktop to use streaming native replies.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', output = '';
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, {once:true});
  try {
    while (true) {
      signal?.throwIfAborted();
      const {value, done} = await reader.read();
      signal?.throwIfAborted();
      if (done) throw Error('The native reply disconnected. Open Chat to check the response before retrying.');
      buffer += decoder.decode(value, {stream:true});
      if (buffer.length > 160000) throw Error('The native reply is too large. Open Chat to read it.');
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,end).trimEnd(); buffer = buffer.slice(end+1);
        if (!line.startsWith('data: ')) continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === 'error') throw Error(event.error || 'Ally could not complete the response.');
        if (event.type === 'reset') {output = ''; onText(output);}
        else if (event.type === 'snapshot') {output = String(event.text); onText(output);}
        else if (event.type === 'text') {output += String(event.text); onText(output);}
        else if (event.type === 'done') {
          if (typeof event.text !== 'string' || !event.text.trim()) throw Error('Open Chat to view this response; it has no spoken text.');
          return event.text;
        }
        if (output.length > 64001) throw Error('The native reply is too large. Open Chat to read it.');
      }
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }
}

export function nativeProgramRelay(delta, program) {
  let emitted = '';
  return {
    update(value) {
      const code=nativeConversationCode(value);
      if (!code && !emitted) return;
      const next='```javascript\n'+code;
      if (!next.startsWith(emitted)) throw Error('The agent restarted its drawing. Open Chat to continue.');
      const part = next.slice(emitted.length); if (part) delta(part); emitted = next;
    },
    finish(value) {
      const code=nativeConversationCode(value,true);
      const final = program('```javascript\n'+code+(code.endsWith('\n')?'':'\n')+'```');
      if (!emitted) {delta(final); emitted = final; return;}
      if (final.startsWith(emitted)) delta(final.slice(emitted.length));
      else if (final.trim() !== emitted.trim()) throw Error('The native drawing changed while streaming. Open Chat to continue.');
    },
  };
}

/** Native captions use this same speed. Invalid inputs must never reach Google. */
export function nativeSpeechRate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0.25, Math.min(2, value)) : 1;
}
export function nativeSpeechConfig(voice, speed = 1) {
  return {voice:{name:voice,languageCode:voice.slice(0,5)},streamingAudioConfig:{audioEncoding:'PCM',sampleRateHertz:24000,speakingRate:nativeSpeechRate(speed)}};
}
