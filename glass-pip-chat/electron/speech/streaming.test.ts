import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ input: null as any, output: null as any, close: vi.fn(), recognize: vi.fn() }));
vi.mock('@google-cloud/speech', () => ({ v2: { SpeechClient: class { _streamingRecognize() { return mocks.input; } recognize = mocks.recognize; close = mocks.close; } } }));
vi.mock('@google-cloud/text-to-speech', () => ({ TextToSpeechClient: class { streamingSynthesize() { return mocks.output; } close = mocks.close; } }));
import { recognizeLive, synthesizeLive } from './streaming';
const settings = { cloud: true, project: 'test-project', voice: 'en-AU-Chirp3-HD-Aoede', notifications: true };
function stream() { return Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn(), destroy: vi.fn(), writableLength: 0 }); }
describe('bounded Google speech streams', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.input = stream(); mocks.output = stream(); });
  it('previews partials but commits only final segments, once', () => {
    const events: any[] = [];
    const mic = recognizeLive(settings, event => events.push(event));
    mocks.input.emit('data', { results: [{ alternatives: [{ transcript: 'Wrong' }] }] });
    mocks.input.emit('data', { results: [{ isFinal: true, alternatives: [{ transcript: 'Right.' }] }] });
    mic.end(); mocks.input.emit('end'); mocks.input.emit('end');
    expect(events.filter(event => event.type === 'complete')).toEqual([{ type: 'complete', text: 'Right.' }]);
    expect(mocks.input.write.mock.calls[0][0].recognizer).toBe('projects/test-project/locations/us/recognizers/_');
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
  it('cancellation suppresses late transcripts and completion', () => {
    const emit = vi.fn(); const mic = recognizeLive(settings, emit); mic.cancel();
    mocks.input.emit('data', { results: [{ isFinal: true, alternatives: [{ transcript: 'late' }] }] }); mocks.input.emit('end');
    expect(emit).not.toHaveBeenCalled(); expect(mocks.input.destroy).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed PCM and bounds queued audio without logging it', () => {
    const emit = vi.fn(); const mic = recognizeLive(settings, emit); mic.write(new Uint8Array(3)); mic.write(new Uint8Array(640));
    expect(emit).toHaveBeenCalledWith({ type: 'error', error: 'Live audio limit exceeded.' });
    expect(mocks.input.write).toHaveBeenCalledTimes(1);
  });
  it('does not start Google when cloud speech is off', () => {
    expect(() => recognizeLive({ ...settings, cloud: false }, vi.fn())).toThrow();
    expect(mocks.input.write).not.toHaveBeenCalled();
  });
  it('delivers PCM before the stream ends and cancels outstanding audio', async () => {
    const abort = new AbortController(); const audio = vi.fn();
    const result = synthesizeLive(settings, 'Hello', settings.voice, audio, abort.signal);
    const rejected = expect(result).rejects.toThrow('cancelled');
    mocks.output.emit('data', { audioContent: Buffer.from([0, 1, 2, 3]) });
    expect(audio).toHaveBeenCalledTimes(1);
    expect(mocks.output.write.mock.calls[0][0].streamingConfig.streamingAudioConfig).toEqual({ audioEncoding: 'PCM', sampleRateHertz: 24000 });
    abort.abort(); mocks.output.emit('data', { audioContent: Buffer.from([0, 0]) });
    await rejected; expect(audio).toHaveBeenCalledTimes(1);
  });
});


describe('utterance speaker pass', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.input = stream(); });
  it('adds local labels only when opted in, retaining live previews', async () => {
    mocks.recognize.mockResolvedValue([{ results: [{ alternatives: [{ words: [{ word: 'Hello', speakerLabel: '0' }, { word: 'there', speakerLabel: '0' }, { word: 'Hi!', speakerLabel: '1' }] }] }] }]);
    const emit = vi.fn(); const mic = recognizeLive({ ...settings, diarization: true }, emit, { diarization: true });
    mic.write(new Uint8Array(640)); mic.end(); mocks.input.emit('end'); await Promise.resolve();
    expect(emit).toHaveBeenCalledWith({ type: 'complete', text: 'Hello there Hi!', speakers: [{ speaker: 'Speaker 1', text: 'Hello there' }, { speaker: 'Speaker 2', text: 'Hi!' }] });
    expect(mocks.recognize.mock.calls[0][0].config.languageCodes).toEqual(['en-US']);
  });
  it('retains the stream transcript when speaker recognition fails', async () => {
    mocks.recognize.mockRejectedValue(Error('unavailable')); const emit = vi.fn();
    const mic = recognizeLive({ ...settings, diarization: true }, emit, { diarization: true }); mic.write(new Uint8Array(640));
    mocks.input.emit('data', { results: [{ isFinal: true, alternatives: [{ transcript: 'Original' }] }] }); mic.end(); mocks.input.emit('end'); await Promise.resolve();
    expect(emit).toHaveBeenCalledWith({ type: 'complete', text: 'Original', speakerWarning: expect.any(String) });
  });
  it('suppresses a speaker result arriving after cancellation', async () => {
    let resolve!: (v: unknown) => void; mocks.recognize.mockImplementation(() => new Promise(r => { resolve = r; }));
    const emit = vi.fn(); const mic = recognizeLive({ ...settings, diarization: true }, emit, { diarization: true });
    mic.write(new Uint8Array(640)); mic.end(); mocks.input.emit('end'); mic.cancel(); resolve([{ results: [] }]); await Promise.resolve();
    expect(emit).not.toHaveBeenCalled();
  });
  it('does not bill a speaker pass for ordinary voice input', () => {
    const mic = recognizeLive({ ...settings, diarization: true }, vi.fn()); mic.write(new Uint8Array(640)); mic.end(); mocks.input.emit('end');
    expect(mocks.recognize).not.toHaveBeenCalled();
  });
});
