import { describe, expect, it, vi } from 'vitest';
vi.mock('./runner.js', () => ({ startAgentRun: vi.fn(), stopAgentRun: vi.fn() }));
import { startAgentRun } from './runner.js';
import { generateGreeting } from './greeting';

describe('agent-written greeting', () => {
  it('uses an isolated unsaved request, coalesces calls, and caches the model reply', async () => {
    vi.mocked(startAgentRun).mockImplementation(async (_opts, emit) => {
      emit('g', { kind: 'text', text: 'What shall we make today?' });
      emit('g', { kind: 'done' });
      return 'g';
    });
    const [a, b] = await Promise.all([generateGreeting('codex', 'test-model'), generateGreeting('codex', 'test-model')]);
    expect(a).toBe('What shall we make today?');
    expect(b).toBe(a);
    await generateGreeting('codex', 'test-model');
    expect(startAgentRun).toHaveBeenCalledTimes(1);
    const options = vi.mocked(startAgentRun).mock.calls[0][0];
    expect(options).toMatchObject({ provider: 'codex', model: 'test-model', ephemeral: true, permission: 'readonly' });
    expect(options.sessionId).toBeUndefined();
  });
});
