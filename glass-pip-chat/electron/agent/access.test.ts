import { describe, expect, it, vi } from 'vitest';
import { codexAccessSettings, validateAccess, unsupportedAccessUpdate } from './access';
import { updateDesktopAccess, type CodexDesktopClient } from './codexDesktop';

describe('explicit access changes', () => {
  it('preserves restricted scopes and required MCP confirmations', () => {
    expect(codexAccessSettings('readonly', 'C:/work')).toMatchObject({ sandboxPolicy: { type: 'readOnly' }, approvalPolicy: 'on-request' });
    expect(codexAccessSettings('edit', 'C:/work')).toMatchObject({ sandboxPolicy: { type: 'workspaceWrite', writableRoots: ['C:/work'], networkAccess: false } });
    expect(codexAccessSettings('full', 'C:/work')).toMatchObject({ sandboxPolicy: { type: 'dangerFullAccess' }, approvalsReviewer: 'user', approvalPolicy: 'on-request' });
    expect(() => validateAccess('bypass')).toThrow();
    expect(unsupportedAccessUpdate(Error('Method not found'))).toBe(true);
    expect(unsupportedAccessUpdate(Error('Request timed out'))).toBe(false);
  });
  it('updates the exact active native turn without a model input or restart', async () => {
    const client = { snapshot: vi.fn(async () => ({ id: 'same', cwd: 'C:/work', turns: [{ turnId: 'turn-berry-display-3', status: 'inProgress' }] })), request: vi.fn(async (..._args: unknown[]) => ({ result: { method: 'thread-follower-update-thread-settings', result: { applied: true } } })) };
    await expect(updateDesktopAccess(client as unknown as CodexDesktopClient, 'owner', 'same', 'full')).resolves.toBe('current_reply');
    expect(client.request).toHaveBeenCalledExactlyOnceWith('thread-follower-update-thread-settings', { conversationId: 'same', activeTurnId: 'turn', threadSettings: codexAccessSettings('full', 'C:/work') }, 'owner', 20000);
  });
  it('labels idle changes and rejects wrong chat, missing turn identity and unconfirmed outcomes', async () => {
    const client = { snapshot: vi.fn(async () => ({ id: 'same', cwd: 'C:/work', turns: [] as any[] })), request: vi.fn(async (..._args: unknown[]) => ({ result: { method: 'thread-follower-update-thread-settings', result: { applied: true } } })) };
    const native = client as unknown as CodexDesktopClient;
    await expect(updateDesktopAccess(native, 'owner', 'same', 'readonly')).resolves.toBe('next_message');
    expect(client.request.mock.calls[0][1]).not.toHaveProperty('activeTurnId');
    client.snapshot.mockResolvedValue({ id: 'other', cwd: 'C:/work', turns: [] });
    await expect(updateDesktopAccess(native, 'owner', 'same', 'full')).rejects.toThrow('verified');
    client.snapshot.mockResolvedValue({ id: 'same', cwd: 'C:/work', turns: [{ status: 'inProgress' }] });
    await expect(updateDesktopAccess(native, 'owner', 'same', 'full')).rejects.toThrow('identity');
    client.snapshot.mockResolvedValue({ id: 'same', cwd: 'C:/work', turns: [] });
    client.request.mockResolvedValue({ result: { method: 'thread-follower-update-thread-settings', result: { applied: false } } });
    await expect(updateDesktopAccess(native, 'owner', 'same', 'full')).rejects.toThrow('confirm');
  });
});

