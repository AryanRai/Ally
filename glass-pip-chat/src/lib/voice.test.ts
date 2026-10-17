import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('shared voice lifecycle', () => {
  beforeEach(() => { vi.resetModules(); });
  it('shares concurrent Connect calls and reports a failed connection truthfully', async () => {
    const connect = vi.fn().mockResolvedValue({ success: false, error: 'Runtime missing' });
    window.pip.speech = { connect } as unknown as typeof window.pip.speech;
    const { voice } = await import('./voice');
    const results = await Promise.allSettled([voice.connect(), voice.connect()]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(results.map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect(voice.getSnapshot().status.connected).toBe(false);
    expect(voice.getSnapshot().speechError).toBe('Runtime missing');
  });
  it('Disconnect invalidates an in-flight Connect instead of reconnecting itself', async () => {
    let resolveConnect!: (result: { success: boolean }) => void;
    const connect = vi.fn().mockImplementation(() => new Promise(resolve => { resolveConnect = resolve; }));
    window.pip.speech = { connect, getStatus: vi.fn().mockResolvedValue({ ready: true }), cancel: vi.fn().mockResolvedValue({ success: true }) } as unknown as typeof window.pip.speech;
    const { voice } = await import('./voice');
    const pending = voice.connect();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    await voice.disconnect();
    resolveConnect({ success: true });
    await pending;
    expect(voice.getSnapshot().status.connected).toBe(false);
    expect(voice.getSnapshot().status.phase).toBe('offline');
    expect(connect).toHaveBeenCalledTimes(1);
  });
  it('microphone permission failure turns voice off and preserves the actionable error', async () => {
    window.pip.speech = { connect: vi.fn().mockResolvedValue({ success: true }), getStatus: vi.fn().mockResolvedValue({ ready: true }) } as unknown as typeof window.pip.speech;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error('Microphone permission denied')) } });
    const { voice } = await import('./voice');
    await expect(voice.startListening()).rejects.toThrow('Microphone permission denied');
    expect(voice.getSnapshot().status.listening).toBe(false);
    expect(voice.getSnapshot().voiceModeEnabled).toBe(false);
    expect(voice.getSnapshot().speechError).toBe('Microphone permission denied');
  });
});
