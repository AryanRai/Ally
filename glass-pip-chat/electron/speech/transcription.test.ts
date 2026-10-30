// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ live: vi.fn(), ensure: vi.fn(async () => ({url:'http://local-worker',token:'local-test'})) }));
vi.mock('./runtime.js', () => ({ensureSpeechRuntime:mocks.ensure}));
vi.mock('./settings.js', () => ({speechSettings:()=>({cloud:false})}));
vi.mock('./gemini.js', () => ({recognizeGeminiLive:mocks.live}));
import { pcmFromVoiceWav, transcribeRecording } from './transcription';
const settings = {cloud:true,cloudProvider:'gemini' as const,project:'orbit-test',voice:'unused',notifications:true};
function wav() {
  const bytes=Buffer.alloc(6444);bytes.write('RIFF');bytes.writeUInt32LE(6436,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);
  bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(6400,40);return bytes;
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('validates PCM encoding before any Google request',()=>{
  expect(pcmFromVoiceWav(wav())).toHaveLength(6400);
  const invalid=wav();invalid.writeUInt32LE(48000,24);expect(()=>pcmFromVoiceWav(invalid)).toThrow('16 kHz');
  const truncated=wav();truncated.writeUInt32LE(99999,40);expect(()=>pcmFromVoiceWav(truncated)).toThrow('Incomplete');
});
it('returns only final Gemini text and ends a bounded recording once',async()=>{
  const write=vi.fn(),end=vi.fn();
  mocks.live.mockImplementation((_,emit)=>({write,end:()=>{end();queueMicrotask(()=>{emit({type:'transcript',text:'interim'});emit({type:'complete',text:'Final words'});});},cancel:vi.fn()}));
  expect(await transcribeRecording(wav(),settings)).toEqual({text:'Final words'});
  expect(mocks.ensure).not.toHaveBeenCalled();expect(write).toHaveBeenCalledOnce();expect(end).toHaveBeenCalledOnce();
});
it('falls back to local after a Gemini error, never sending an interim hypothesis',async()=>{
  mocks.live.mockImplementation((_,emit)=>({write:vi.fn(),end:()=>queueMicrotask(()=>{emit({type:'transcript',text:'wrong'});emit({type:'error',error:'unavailable'});}),cancel:vi.fn()}));
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({text:'Recovered locally'})})));
  expect(await transcribeRecording(wav(),settings)).toEqual({text:'Recovered locally',warning:expect.stringContaining('local transcription')});
  expect(mocks.ensure).toHaveBeenCalledOnce();
});
