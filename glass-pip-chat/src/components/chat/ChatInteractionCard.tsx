import { useState } from 'react';
import { Check, CircleHelp, Clock, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import type { InteractionHistory } from '../../../electron/devices/interactions';
import type { ApprovalAnswer } from '../../../electron/watch/approvals';

export interface ChatInteractionCardProps {
  request: InteractionHistory;
  onAnswer: (id: string, answer: ApprovalAnswer) => Promise<unknown>;
}

export default function ChatInteractionCard({ request, onAnswer }: ChatInteractionCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const pending = request.state === 'pending';
  const expired = pending && request.expiresAt <= Date.now();
  const question = request.kind === 'question';
  const allowed = ['accept', 'acceptForSession', 'submit', 'submitForSession', 'submitAlways'].includes(request.decision ?? '');
  const outcome = request.state === 'answered'
    ? request.decision === 'decline' ? 'Denied' : request.decision === 'cancel' ? 'Cancelled' : question ? 'Answered' : 'Allowed once'
    : request.state === 'cancelled' ? 'Cancelled' : 'Expired';
  const label = pending && !expired ? question ? 'Needs your answer' : 'Needs approval' : expired ? 'Expired' : outcome;
  const Icon = pending ? question ? CircleHelp : ShieldCheck : request.state === 'answered' && allowed ? Check : request.state === 'expired' ? Clock : X;
  const invalid = request.fields.some(field => field.required && !values[field.id]?.trim());
  const decide = async (action: string) => {
    if (sending || !pending || expired) return;
    setSending(true); setError('');
    try { await onAnswer(request.id, { action, ...(['submit', 'submitForSession', 'submitAlways'].includes(action) ? { values } : {}) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Decision was not confirmed. Try again.'); }
    finally { setSending(false); }
  };
  return (
    <details key={`${request.id}:${pending}`} open={pending || undefined} aria-label={`${question ? 'Question' : 'Approval'}: ${request.title}`} className={`min-w-0 overflow-hidden rounded-2xl border ${pending ? 'border-amber-300/25 bg-amber-300/[0.04]' : 'border-border bg-white/[0.02]'} p-3 text-foreground`}>
      <summary className="cursor-pointer text-xs">{request.title} · {label}</summary>
      <div className="flex items-start gap-2.5">
        <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${pending ? 'bg-amber-200/10 text-amber-200' : 'bg-white/5 text-foreground/60'}`}><Icon className="size-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground"><span>{question ? 'QUESTION' : 'APPROVAL'}</span><span role="status">{label}</span></div>
          <h3 className="mt-0.5 break-words text-sm font-medium">{request.title}</h3>
        </div>
      </div>
      {pending ? <>
        {request.detail && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">{request.detail}</p>}
        <fieldset disabled={sending || expired} className="mt-3 min-w-0 space-y-3">
          {request.fields.map(field => <div key={field.id} className="min-w-0 space-y-1.5">
            <label htmlFor={`${request.id}-${field.id}`} className="block whitespace-pre-wrap text-xs font-medium">{field.label}{field.required ? ' *' : ''}</label>
            {field.options.length > 0 && <select id={`${request.id}-${field.id}`} aria-label={field.label} value={field.options.some(option => option.value === values[field.id]) ? values[field.id] : ''} onChange={event => setValues(all => ({ ...all, [field.id]: event.target.value }))} className="w-full min-w-0 rounded-lg border border-border bg-background p-2 text-xs">
              <option value="">Choose an answer…</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>}
            {(field.freeText || field.secret) && <input id={field.options.length ? `${request.id}-${field.id}-other` : `${request.id}-${field.id}`} aria-label={field.options.length ? `${field.label} — other answer` : field.label} type={field.secret ? 'password' : 'text'} autoComplete="off" value={values[field.id] ?? ''} onChange={event => setValues(all => ({ ...all, [field.id]: event.target.value }))} maxLength={4000} placeholder={field.options.length ? 'Or enter another answer…' : 'Your answer…'} className="w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-2 text-xs" />}
          </div>)}
        </fieldset>
        {request.desktopOnly && <p className="mt-2 text-[10px] text-muted-foreground">Private answer · desktop only · value is not saved in history</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {request.actions.map(action => <button key={action.value} type="button" disabled={sending || expired || (['submit', 'submitForSession', 'submitAlways'].includes(action.value) && invalid)} onClick={() => void decide(action.value)} className={`min-h-8 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${['accept', 'acceptForSession', 'submit', 'submitForSession', 'submitAlways'].includes(action.value) ? 'bg-foreground text-background hover:opacity-85' : 'border border-border bg-white/[0.03] hover:bg-white/10'}`}>{action.label}</button>)}
          {sending && <span className="flex items-center gap-1 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Sending…</span>}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-amber-200 [overflow-wrap:anywhere]">{error}</p>}
      </> : <>
        <p className="mt-2 text-[11px] text-muted-foreground">{outcome}{request.answeredOn ? ` on ${request.answeredOn}` : ''} · {new Date(request.closedAt ?? request.createdAt ?? 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        {(request.detail || request.fields.length > 0) && <details className="mt-2 text-xs text-foreground/70"><summary className="cursor-pointer">View request{question ? ' and answer' : ''}</summary>
          {request.detail && <p className="mt-2 whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{request.detail}</p>}
          {request.fields.map(field => <p key={field.id} className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]"><span className="font-medium">{field.label}</span>{request.state === 'answered' ? `: ${field.secret ? 'Private answer not saved' : request.values?.[field.id] ?? 'No answer'}` : ''}</p>)}
        </details>}
      </>}
    </details>
  );
}
