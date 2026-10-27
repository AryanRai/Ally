import { shell } from 'electron';
import { CodexDesktopClient } from './codexDesktop.js';

/** Navigation only: load the original owner without a prompt, resume or fork. */
export async function recoverExactCodexOwner(id: string, cancelled: () => boolean = () => false,
  open = (uri: string) => shell.openExternal(uri), pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw Error('Invalid original Codex chat identity');
  if (cancelled()) return;
  await open(`codex://threads/${id}`);
  let last: unknown;
  for (let attempt = 0; attempt < 6 && !cancelled(); attempt++) {
    let client: CodexDesktopClient | undefined;
    try {
      client = await CodexDesktopClient.connect();
      const owner = await client.owner(id);
      const state = await client.snapshot(id, owner);
      if (state.id !== id) throw Error('Codex opened a different chat');
      return;
    } catch (error) { last = error; }
    finally { client?.close(); }
    if (attempt < 5 && !cancelled()) await pause(500);
  }
  if (!cancelled()) throw Error(`The original Codex chat could not reconnect: ${last instanceof Error ? last.message : 'owner unavailable'}. Your draft and attachments are kept. No copy was created.`);
}
