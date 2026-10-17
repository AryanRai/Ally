import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentProvider } from './types.js';

/** Read-only notifications; never resumes or locks the session being observed. */
export function watchAgentSessions(changed: (provider: AgentProvider) => void): () => void {
  const watchers: fs.FSWatcher[] = [];
  const timers = new Map<AgentProvider, ReturnType<typeof setTimeout>>();
  const notify = (provider: AgentProvider) => {
    if (timers.has(provider)) return;
    // Throttle rather than debounce so a continuously written turn still updates.
    timers.set(provider, setTimeout(() => { timers.delete(provider); changed(provider); }, 400));
  };
  for (const [provider, folder, recursive] of [
    ['claude', '.claude/projects', true],
    ['codex', '.codex/sessions', true],
    ['codex', '.codex/archived_sessions', true],
    ['codex', '.codex', false],
  ] as const) {
    try {
      const watcher = fs.watch(path.join(os.homedir(), folder), { recursive }, (_, name) => {
        if (!name || String(name).endsWith('.jsonl') || (provider === 'codex' && /\.sqlite(?:-wal)?$/.test(String(name)))) notify(provider);
      });
      watcher.on('error', () => watcher.close());
      watchers.push(watcher);
    } catch { /* Missing directory / unsupported watcher: renderer polling is the fallback. */ }
  }
  return () => { watchers.forEach(w => w.close()); timers.forEach(clearTimeout); };
}
