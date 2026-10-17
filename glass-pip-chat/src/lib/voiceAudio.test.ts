import { describe, expect, it } from 'vitest';
import { pcm16k, UtteranceBuffer, wav16k } from './voiceAudio';

describe('voice audio boundaries', () => {
  it('writes canonical little endian 16k mono WAV and clamps clipping', () => {
    const bytes = wav16k([Float32Array.of(-2, 0, .5, 2)]);
    const view = new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(44);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(50, true)).toBe(32767);
  });
  it('resamples 48k and 44.1k worklet frames to20ms of16k audio', () => {
    for (const rate of [48000, 44100, 16000]) {
      const result = pcm16k(new Float32Array(rate / 50).fill(.5), rate);
      expect(result.length).toBe(320); expect(result[0]).toBeCloseTo(.5);
    }
  });
  it('discards clicks/silence and preserves pre-roll before speech', () => {
    const buffer = new UtteranceBuffer();
    const silence = new Float32Array(320);
    for (let i = 0; i < 100; i++) expect(buffer.push(silence).utterance).toBeUndefined();
    buffer.push(new Float32Array(320).fill(.1));
    for (let i = 0; i < 35; i++) expect(buffer.push(silence).utterance).toBeUndefined();
    for (let i = 0; i < 12; i++) buffer.push(silence);
    for (let i = 0; i < 15; i++) buffer.push(new Float32Array(320).fill(.1));
    let utterance: Float32Array[] | undefined;
    for (let i = 0; i < 35; i++) utterance = buffer.push(silence).utterance ?? utterance;
    expect(utterance!.length).toBe(61);
    expect(buffer.active).toBe(false);
  });
  it('bounds an uninterrupted utterance to20seconds', () => {
    const buffer = new UtteranceBuffer();
    let utterance: Float32Array[] | undefined;
    for (let i = 0; i < 1000; i++) utterance = buffer.push(new Float32Array(320).fill(.1)).utterance ?? utterance;
    expect(utterance!.length).toBe(1000);
    expect(wav16k(utterance!).length).toBe(640044);
  });
});
