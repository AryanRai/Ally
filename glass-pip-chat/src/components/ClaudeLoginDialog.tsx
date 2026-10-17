import { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ClaudeAccount } from '../../electron/agent/claudeLogin';

type Step = 'idle' | 'waiting' | 'checking' | 'done';

/**
 * Sign in to Claude Code without typing commands: Ally opens a small window
 * running `claude auth login`, the browser asks you to approve and returns to
 * that window (or shows a code to paste there), and Ally checks the login when it closes.
 */
export default function ClaudeLoginDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [tracked, setTracked] = useState(true);
  const [account, setAccount] = useState<ClaudeAccount>();
  const [error, setError] = useState<string>();
  const api = window.pip?.agent;

  useEffect(() => {
    const show = () => { setOpen(true); setError(undefined); };
    window.addEventListener('ally:claude-login', show);
    return () => window.removeEventListener('ally:claude-login', show);
  }, []);

  useEffect(() => api?.claudeLogin.onEvent(ev => {
    if (ev.kind === 'started') { setTracked(ev.tracked); setStep('waiting'); }
    else { setAccount(ev.account); setStep('done'); }
  }), [api]);

  const start = async () => {
    if (!api) return;
    setError(undefined);
    setAccount(undefined);
    try { await api.claudeLogin.start(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const check = async () => {
    if (!api) return;
    setStep('checking');
    try { setAccount(await api.claudeAccount()); } catch (e) { setAccount({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
    setStep('done');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in to Claude Code</DialogTitle>
          <DialogDescription>Uses your Claude subscription, through Claude Code&apos;s own sign-in.</DialogDescription>
        </DialogHeader>

        {step === 'idle' && (
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>A small sign-in window opens, and your browser asks you to approve.</li>
            <li>Approve there. Keep the window open until it finishes (if the browser shows a code instead, paste it into the window).</li>
            <li>Ally checks the sign-in once the window closes.</li>
          </ol>
        )}

        {step === 'waiting' && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin" />
            {tracked
              ? 'Approve in the browser and keep the sign-in window open. Ally will check when it closes.'
              : 'Finish signing in in the terminal window, then press Check.'}
          </p>
        )}

        {step === 'checking' && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" /> Checking sign-in…</p>
        )}

        {step === 'done' && account && (
          account.ok ? (
            <p className="flex items-center gap-2 text-xs"><CheckCircle2 className="size-4 shrink-0 text-emerald-400" /> Signed in{account.email ? ` as ${account.email}` : ''}{account.plan ? ` (${account.plan})` : ''}. Claude Code chats work again.</p>
          ) : (
            <p className="flex items-start gap-2 text-xs"><XCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> {account.error ?? 'Sign-in did not complete.'}</p>
          )
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter className="gap-2">
          {step !== 'idle' && !(step === 'done' && account?.ok) && (
            <Button variant="ghost" size="sm" onClick={() => void check()} disabled={step === 'checking'}>Check</Button>
          )}
          {step === 'done' && account?.ok ? (
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button size="sm" onClick={() => void start()} disabled={step === 'waiting' || step === 'checking'}>
              {step === 'done' ? 'Try again' : 'Sign in'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
