import { codexAccounts } from './codexAccounts.js';
import type { AgentEvent, AgentRunOptions } from './types.js';

type Run = { stop: () => void; steer: (text: string, images?: string[]) => Promise<boolean> };
type Accounts = Pick<typeof codexAccounts, 'autoSwitch' | 'next' | 'label' | 'limited' | 'list'>;

/**
 * A saved limit can be stale (allowances reset early, or the record predates a reset), so before
 * giving up, try each other profile once. Ally's runner reads a profile's live limits before sending
 * and refuses with nothing sent if it is still limited. The original login has no such check, so it
 * is never probed.
 */
const probe = (accounts: Accounts, tried: Set<string>) => accounts.list().map(a => a.id).find(id => id !== 'default' && !tried.has(id));

export const CONTINUE_PROMPT = 'Your previous reply was cut off because the Codex account reached its usage limit; this turn runs on another of my accounts. Continue exactly where you stopped. Do not repeat work or text you already finished.';

/** Structured flag from Ally's own runner; the desktop route only reports text, so it is accepted there only when delivery is certain. */
function hitLimit(ev: Extract<AgentEvent, { kind: 'done' }>) {
  if (ev.usageLimit) return true;
  return !!ev.isError && ev.delivery !== 'uncertain' && /usage limit|usagelimitexceeded/i.test(ev.error ?? '');
}

/**
 * Runs one Codex turn and keeps the same chat going across accounts. A turn refused before it ran
 * is sent again on the next available account; a reply cut off mid-way continues there with a short
 * continuation turn. A turn whose delivery is uncertain is never resent.
 */
export function runCodexTurnCycling<R extends Run>(
  opts: AgentRunOptions,
  emit: (ev: AgentEvent) => void,
  start: (opts: AgentRunOptions, emit: (ev: AgentEvent) => void) => R,
  accounts: Accounts = codexAccounts,
): R {
  const tried = new Set<string>();
  let stopped = false, sessionId = opts.sessionId;
  let current!: R;
  const launch = (o: AgentRunOptions) => {
    const account = o.codexAccountId ?? 'default';
    tried.add(account);
    current = start(o, ev => {
      if (ev.kind === 'session') sessionId = ev.sessionId;
      if (ev.kind === 'done' && !stopped && !ev.stopped && !o.ephemeral && hitLimit(ev)) {
        // Ally's own runner records the limit itself; the desktop route cannot, so record it here.
        if (!ev.usageLimit || o.codexDesktop) { try { accounts.limited(account); } catch { /* Observation only. */ } }
        const resumable = ev.delivery === 'not_sent' || (ev.delivery === 'accepted' && !!sessionId);
        const next = resumable && accounts.autoSwitch() ? accounts.next(tried) ?? probe(accounts, tried) : undefined;
        if (next) {
          const cutOff = ev.delivery === 'accepted';
          emit({ kind: 'stderr', text: `${accounts.label(account)} reached its usage limit · ${cutOff ? 'continuing' : 'sending'} on ${accounts.label(next)}` });
          launch({
            ...o, sessionId: sessionId ?? o.sessionId, codexAccountId: next,
            codexDesktop: next === 'default' && opts.codexDesktop,
            ...(cutOff ? { prompt: CONTINUE_PROMPT, images: undefined, resumeToken: undefined } : {}),
          });
          return;
        }
        if (resumable && accounts.autoSwitch()) emit({ kind: 'stderr', text: 'All your Codex accounts have reached their usage limits.' });
      }
      emit(ev);
    });
  };
  launch(opts);
  // Callers keep this handle; every access reaches the account run that is active now.
  return new Proxy({} as R, {
    get: (_target, key) => {
      if (key === 'stop') return () => { stopped = true; current.stop(); };
      const value = (current as any)[key];
      return typeof value === 'function' ? value.bind(current) : value;
    },
  });
}
