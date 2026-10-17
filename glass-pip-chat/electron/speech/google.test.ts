import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('google-auth-library', () => ({ GoogleAuth: class { async getClient() { return { request: mocks.request }; } } }));

describe('Google speech adapter', () => {
  beforeEach(() => { vi.resetModules(); mocks.request.mockReset(); });
  it('uses a returned Chirp voice and returns WAV without exposing credentials', async () => {
    mocks.request.mockResolvedValueOnce({ data: { voices: [
      { name: 'en-AU-Chirp3-HD-Aoede', languageCodes: ['en-AU'] },
      { name: 'en-US-Standard-A', languageCodes: ['en-US'] },
    ] } }).mockResolvedValueOnce({ data: { audioContent: 'UklGRg==' } });
    const { googleVoices, googleSpeech } = await import('./google');
    expect(await googleVoices()).toHaveLength(1);
    expect(await googleSpeech('Hello', 'en-AU-Chirp3-HD-Aoede')).toBe('UklGRg==');
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request.mock.calls[1][0].data).toEqual({ input: { text: 'Hello' }, voice: { name: 'en-AU-Chirp3-HD-Aoede', languageCode: 'en-AU' }, audioConfig: { audioEncoding: 'LINEAR16' } });
  });
  it('rejects arbitrary voices and oversized UTF8 text before synthesis', async () => {
    mocks.request.mockResolvedValue({ data: { voices: [{ name: 'en-AU-Chirp3-HD-Aoede', languageCodes: ['en-AU'] }] } });
    const { googleSpeech } = await import('./google');
    await expect(googleSpeech('Hello', 'invented')).rejects.toThrow('Select an available');
    await expect(googleSpeech('😀'.repeat(1200), 'en-AU-Chirp3-HD-Aoede')).rejects.toThrow('limit');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('reports a sanitized credential error', async () => {
    mocks.request.mockRejectedValue(new Error('secret token diagnostic'));
    const { googleVoices } = await import('./google');
    await expect(googleVoices()).rejects.toThrow('Application Default Credentials');
    await expect(googleVoices()).rejects.not.toThrow('secret');
  });
});
