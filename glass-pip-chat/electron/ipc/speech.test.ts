import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), native: vi.fn(), cloud: vi.fn(), ensure: vi.fn() }));
vi.mock('electron', () => ({ app: { on: vi.fn() }, ipcMain: { handle: (name: string, callback: (...args: any[]) => any) => mocks.handlers.set(name, callback) } }));
vi.mock('../speech/runtime.js', () => ({ ensureSpeechRuntime: mocks.ensure, getSpeechRuntimeStatus: vi.fn(), stopSpeechRuntime: vi.fn() }));
vi.mock('../speech/native.js', () => ({ nativeSpeech: mocks.native, cancelNativeSpeech: vi.fn(), installedVoices: vi.fn() }));
vi.mock('../speech/google.js', () => ({ googleSpeech: mocks.cloud, googleVoices: vi.fn() }));
vi.mock('../speech/outputMute.js', () => ({ outputMute: () => ({muted:false}), setOutputMute: vi.fn(), registerOutputMute: vi.fn() }));

describe('voice IPC', () => {
  beforeEach(async () => { vi.clearAllMocks(); mocks.handlers.clear(); const { registerSpeechIpc } = await import('./speech'); registerSpeechIpc(); });
  it('defaults to local synthesis and makes no cloud request', async () => {
    mocks.native.mockResolvedValue('local-wave');
    const result = await mocks.handlers.get('speech:synthesize')!(null, 'Hello', {});
    expect(result).toEqual({ success: true, audio_data: 'local-wave', provider: 'local' });
    expect(mocks.cloud).not.toHaveBeenCalled();
  });
  it('clearly reports fallback when selected cloud synthesis fails', async () => {
    mocks.cloud.mockRejectedValue(new Error('Google unavailable.')); mocks.native.mockResolvedValue('local-wave');
    const result = await mocks.handlers.get('speech:synthesize')!(null, 'Hello', { engine: 'google', cloudVoice: 'returned-name' });
    expect(result.provider).toBe('local');
    expect(result.warning).toContain('Using your Windows voice');
  });
  it('does not report connection failure as success', async () => {
    mocks.ensure.mockRejectedValue(new Error('Runtime missing'));
    expect(await mocks.handlers.get('speech:connect')!()).toEqual({ success: false, error: 'Runtime missing' });
  });
  it('rejects oversized recordings before invoking the worker', async () => {
    const result = await mocks.handlers.get('speech:transcribe')!(null, new Uint8Array(2_000_000));
    expect(result.success).toBe(false); expect(mocks.ensure).not.toHaveBeenCalled();
  });
});
