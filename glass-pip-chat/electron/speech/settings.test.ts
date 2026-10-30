import { beforeEach, expect, it, vi } from 'vitest';
const file = vi.hoisted(() => ({ data: '{}', write: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => '/speech-test' } }));
vi.mock('node:fs', () => ({ default: { readFileSync: () => file.data, writeFileSync: (...args: unknown[]) => file.write(...args) } }));
import { saveSpeechSettings, speechSettings } from './settings';
beforeEach(() => { file.data = '{}'; file.write.mockClear(); });
it('preserves existing Chirp choices and speaker settings without an implicit switch', () => {
  file.data = JSON.stringify({ cloud: true, project: 'orbit-test', voice: 'en-AU-Chirp3-HD-Aoede', diarization: true });
  expect(speechSettings().cloudProvider).toBeUndefined();
  const saved = saveSpeechSettings({ geminiVoice: 'Aoede', geminiStyle: 'Warm and natural' });
  expect(saved.cloudProvider).toBeUndefined(); expect(saved.diarization).toBe(true);
  expect(saved.voice).toBe('en-AU-Chirp3-HD-Aoede');
});
it('keeps transcription independent of output and rejects unrecognized controls', () => {
  const saved = saveSpeechSettings({ cloud: true, cloudProvider: 'gemini', transcriptionProvider: 'google', project: 'orbit-test', geminiVoice: 'Kore', geminiMode: 'SMART', geminiLocation: 'global' });
  expect(saved).toMatchObject({ cloudProvider: 'gemini', transcriptionProvider: 'google', geminiVoice: 'Kore', geminiMode: 'SMART' });
  const rejected = saveSpeechSettings({ cloudProvider: 'arbitrary' as any, geminiVoice: '<script>', geminiStyle: 'x'.repeat(301), geminiLocation: 'host.invalid' as any });
  expect(rejected.cloudProvider).toBeUndefined(); expect(rejected.geminiVoice).toBeUndefined(); expect(rejected.geminiStyle).toBeUndefined();
});
