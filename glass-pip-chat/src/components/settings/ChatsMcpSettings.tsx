import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type AppState = { claude: boolean | null; codex: boolean | null };

const label = (v: boolean | null | undefined) => (v == null ? 'not installed' : v ? 'added' : 'not added');

/**
 * Cross-chat tools (ally_chats MCP server). Ally's own agent runs always get
 * them; this button also registers them in the Claude Code and Codex apps
 * (user-level config), which the Codex desktop route needs. Only on click.
 */
export default function ChatsMcpSettings({ muted, box }: { muted: string; box: string }) {
  const api = window.pip?.chatsMcp;
  const [status, setStatus] = useState<{ running: boolean; port?: number; tools: string[]; indexed: number } | null>(null);
  const [apps, setApps] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!api) return;
    void api.status().then(setStatus);
    void api.appStatus().then(setApps).catch(() => {});
  }, [api]);

  if (!api) return null;
  const added = apps?.claude || apps?.codex;

  const act = async (fn: () => Promise<unknown>, done: (r: unknown) => string) => {
    setBusy(true);
    setMessage(undefined);
    try {
      const r = await fn();
      setMessage(done(r));
      setApps(await api.appStatus());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <span className={cn('text-xs block', muted)}>Cross-chat tools</span>
      <p className={cn('text-[11px] leading-snug', muted)}>
        Lets any chat find, read and forward to your other Claude Code and Codex chats, e.g. “send this to my latest Ally dev chat”.
        {' '}{status?.running ? `Running on this computer only (port ${status.port}).` : 'Starting…'}
      </p>
      <p className={cn('text-[11px]', muted)}>
        In the apps: Claude Code {label(apps?.claude)} · Codex {label(apps?.codex)}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={busy || !status?.running}
          className={cn('rounded-sm border px-2 py-0.5 text-[11px] disabled:opacity-50', box)}
          title="Adds the ally_chats server to your user-level Claude Code and Codex settings, so it also works when you use those apps directly"
          onClick={() => void act(() => api.addToApps(), r => {
            const res = r as { claude: string; codex: string };
            return `Claude Code: ${res.claude} · Codex: ${res.codex}. Restart those apps to pick it up.`;
          })}
        >
          {added ? 'Re-add to Claude Code & Codex' : 'Add to Claude Code & Codex apps'}
        </button>
        {added && (
          <button type="button" disabled={busy} className={cn('rounded-sm border px-2 py-0.5 text-[11px] disabled:opacity-50', box)}
            onClick={() => void act(() => api.removeFromApps(), () => 'Removed from the apps.')}>
            Remove
          </button>
        )}
        {busy && <LoaderCircle className="size-3 animate-spin" />}
      </div>
      {message && <p className={cn('text-[11px]', muted)}>{message}</p>}
    </div>
  );
}
