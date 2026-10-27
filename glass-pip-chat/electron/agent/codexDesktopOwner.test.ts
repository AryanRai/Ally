// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { CodexChatUnownedError, CodexDesktopClient } from './codexDesktop';
afterEach(() => vi.restoreAllMocks());
const discovery = {handledByClientId:'cached-owner',result:{supportsUntrustedAppInput:true}};
it('verifies the live owner gate even when cached discovery succeeds', async () => {
  const client=new CodexDesktopClient();
  const request=vi.spyOn(client,'request').mockResolvedValueOnce(discovery).mockResolvedValueOnce({result:{settings:{}}});
  expect(await client.owner('original')).toBe('cached-owner');
  expect(request.mock.calls).toEqual([
    ['thread-owner-discovery',{hostId:'local',conversationId:'original'}],
    ['thread-follower-read-model-settings',{conversationId:'original'},'cached-owner'],
  ]);
});
it('classifies a cached owner rejecting actual read delivery as unowned before any turn is sent', async () => {
  const client=new CodexDesktopClient();
  const request=vi.spyOn(client,'request').mockResolvedValueOnce(discovery).mockRejectedValueOnce(new Error('no-client-found'));
  await expect(client.owner('original')).rejects.toBeInstanceOf(CodexChatUnownedError);
  expect(request.mock.calls.some(call=>call[0]==='thread-follower-start-turn')).toBe(false);
});
it.each(['timeout','client-disconnected','Unsupported desktop owner'])('never converts uncertain %s into fallback authorization', async message => {
  const client=new CodexDesktopClient();
  vi.spyOn(client,'request').mockResolvedValueOnce(discovery).mockRejectedValueOnce(new Error(message));
  await expect(client.owner('original')).rejects.toThrow(message);
});
