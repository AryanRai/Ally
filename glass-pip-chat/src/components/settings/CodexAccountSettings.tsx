import { useEffect, useState } from 'react';
import type { CodexAccountsSnapshot } from '../../../electron/agent/codexAccounts';

export default function CodexAccountSettings() {
  const api = window.pip?.agent?.codexAccounts;
  const [data, setData] = useState<CodexAccountsSnapshot>();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (api) void api.list().then(setData).catch(e => setError(String(e))); }, [api]);
  useEffect(() => {
    if (!api || !data?.signingIn) return;
    const timer = setInterval(() => { void api.list().then(setData).catch(() => {}); }, 1500);
    return () => clearInterval(timer);
  }, [api, data?.signingIn]);
  if (!api) return null;
  const run = async (operation: () => Promise<CodexAccountsSnapshot>) => {
    setBusy(true); setError('');
    try { setData(await operation()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <section className="space-y-2 rounded-lg border border-white/10 p-3 text-xs" aria-label="Codex accounts">
    <h4 className="font-medium">Codex accounts</h4>
    <p className="text-[11px] opacity-70">Add a separate profile and use normal ChatGPT sign-in for each account. Selecting an account applies to new chats. All accounts share one chat history, so any chat can continue on any account.</p>
    {data && <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5" checked={data.autoSwitch !== false} disabled={busy} onChange={e => void run(() => api.autoSwitch(e.target.checked))} />
      <span>Switch accounts automatically when one reaches its usage limit<span className="block text-[11px] opacity-70">The same chat continues on your next available account. A reply cut off mid-way picks up where it stopped; a message that was refused is sent once on the next account.</span></span>
    </label>}
    {data?.accounts.map(account => {
      const status = data.status[account.id];
      return <div key={account.id} className="space-y-1 border-t border-white/10 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{account.label}</span>
          <button disabled={busy || !!data.signingIn} onClick={() => void run(() => api.select(account.id))} className="underline">
            {data.selected === account.id ? 'Selected for new chats' : 'Use for new chats'}
          </button>
          <button disabled={busy || !!data.signingIn} onClick={() => void run(() => api.check(account.id))} className="underline">Check usage</button>
          {account.id !== 'default' && <>
            <button disabled={busy || !!data.signingIn} onClick={() => void run(() => api.login(account.id))} className="underline">Sign in…</button>
            <button disabled={busy || !!data.signingIn || data.selected === account.id} onClick={() => void run(() => api.remove(account.id))} className="underline">Remove profile</button>
          </>}
        </div>
        <p>{status ? `${status.state}${status.email ? ` · ${status.email}` : ''}${status.plan ? ` · ${status.plan}` : ''}` : 'Sign-in and usage not checked'}</p>
        {status?.windows.map(w => <p key={w.name} className="opacity-70">{w.name}: {w.usedPercent}% used{w.resetsAt ? ` · resets ${new Date(w.resetsAt).toLocaleString()}` : ''}</p>)}
        {status?.message && <p>{status.message}</p>}
        {status && <p className="opacity-60">Last checked {new Date(status.checkedAt).toLocaleString()}. Usage can change; this does not guarantee model access.</p>}
      </div>;
    })}
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await api.add(label); setLabel(''); return result; }); }}>
      <input aria-label="New Codex account label" value={label} maxLength={80} onChange={e => setLabel(e.target.value)} placeholder="Account label" className="min-w-0 flex-1 rounded border border-white/10 bg-transparent px-2 py-1" />
      <button disabled={busy || !label.trim()}>Add profile</button>
    </form>
    {data?.signingIn && <p>Complete sign-in in your browser. <button disabled={busy} className="underline" onClick={() => void run(api.cancelLogin)}>Cancel sign-in</button></p>}
    <p className="text-[11px] opacity-70">Usage limits remain enforced. Ally never rotates accounts or replays a failed turn automatically. Profile removal keeps Codex credentials and history on disk.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
