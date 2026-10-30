/** Page/debugger failures must not be described as a lost Chrome connection. */
export function browserFault(message: string, chromeConnected: boolean) {
  const base = { chromeConnected, retryActionAutomatically: false };
  if (/Browser access stopped for this turn/i.test(message)) return { ...base, code: 'BROWSER_TURN_STOPPED',
    recovery: 'Browser access is stopped for this turn. Do not reconnect, reset the task, change browser or replay the action. Report the exact stop reason. A later genuine user turn is separate; its initial observation must still respect ownership and restrictions.' };
  if (/Stale or unknown reference|Element disappeared/i.test(message)) return { ...base, code: 'STALE_PAGE_REFERENCE',
    recovery: 'The page reference expired. This does not mean Chrome disconnected. Read the returned fresh snapshot or request one before choosing any next action.' };
  if (/owned|another.*(job|chat|turn)|already.*working|already has an active/i.test(message)) return { ...base, code: 'BROWSER_BUSY_OR_OWNED',
    recovery: 'Keep the current owner. Do not reconnect or take over another chat’s tab.' };
  if (/disconnect|transport|timed out|Outcome may be unknown/i.test(message)) return { ...base, code: 'BROWSER_TRANSPORT_OR_TIMEOUT',
    recovery: 'Inspect connection status and page state before any further action. Delivery may be uncertain; never replay automatically.' };
  return { ...base, code: 'BROWSER_PAGE_ERROR', recovery: 'Report this exact page error. Do not assume Chrome is disconnected or repeat a side effect.' };
}
