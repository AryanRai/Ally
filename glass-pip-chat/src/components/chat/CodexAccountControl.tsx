import { useEffect, useState } from 'react';
import type { CodexAccountsSnapshot } from '../../../electron/agent/codexAccounts';

/** Selection never sends a prompt or mutates the source thread. */
export default function CodexAccountControl({ accountId, hasSession, disabled, onChoose }: {
  accountId?: string; hasSession: boolean; disabled: boolean; onChoose: (id: string) => void;
}) {
  const [data, setData] = useState<CodexAccountsSnapshot>();
  const [target, setTarget] = useState('');
  const [error, setError] = useState('');
  const refresh = () => { void window.pip?.agent?.codexAccounts?.list().then(setData).catch(() => setError('Account profiles are unavailable. Your chat is unchanged.')); };
  useEffect(refresh, []);
  if (!data || data.accounts.length < 2) return error ? <p role="alert">{error}</p> : null;
  const currentId = accountId ?? (hasSession ? 'default' : data.selected);
  const current = data.accounts.find(a => a.id === currentId);
  return <div className="space-y-1 border-t border-border px-3 py-2 text-[11px]" onFocus={refresh} onKeyDown={event => event.stopPropagation()}>
    <p>Codex account: {current?.label ?? 'Unavailable profile'}</p>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Codex account for new chat" disabled={disabled} value={target} onChange={e => setTarget(e.target.value)} className="max-w-full rounded border border-border bg-background p-1">
        <option value="">Choose an account…</option>
        {data.accounts.map(a => <option key={a.id} value={a.id}>{a.label} · {data.status[a.id]?.state ?? 'unchecked'}</option>)}
      </select>
      <button type="button" className="underline" disabled={disabled || !target || target === currentId} onClick={() => { if (target && !disabled) onChoose(target); }}>
        {hasSession ? 'Create handoff chat' : 'Use account'}
      </button>
    </div>
    {hasSession && <p className="opacity-70">Handoff creates a separate empty chat. Review the original receipt and any partial work, then write and send the context you want to transfer. Nothing is replayed or copied automatically.</p>}
  </div>;
}
