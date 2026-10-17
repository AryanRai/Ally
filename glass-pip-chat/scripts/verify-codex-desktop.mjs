// Read-only, zero-model-call probe. Usage: node scripts/verify-codex-desktop.mjs <thread-id>
import { CodexDesktopClient, assertDesktopIdle, desktopTurns } from './codex-desktop-client.mjs';

const id = process.argv[2];
if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Pass an existing Codex thread UUID');
const client = await CodexDesktopClient.connect();
try {
  const owner = await client.owner(id);
  const state = await client.snapshot(id, owner);
  let idle = false;
  try { assertDesktopIdle(state, id); idle = true; } catch {}
  console.log(JSON.stringify({ connected: true, threadId: state.id, ownerFound: true, idle,
    runtimeStatus: state.threadRuntimeStatus?.type ?? 'unknown', loadedTurns: desktopTurns(state).length,
    pendingRequests: state.requests?.length ?? 0, modelCalls: 0 }, null, 2));
} finally { client.close(); }
