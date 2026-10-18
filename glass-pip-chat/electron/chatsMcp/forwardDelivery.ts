import type { AgentEvent } from '../agent/types.js';
import type { SendResult } from './tools.js';

/** Spawning a process or obtaining a session ID is not message acceptance. */
export function forwardDelivery(start: (emit: (event: AgentEvent) => void) => Promise<unknown>, wait: boolean, timeoutMs: number, done: () => void): Promise<SendResult> {
  return new Promise(resolve => {
    let settled = false, accepted = false, reply = '', turnId: string | undefined;
    const settle = (result: SendResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    const timer = setTimeout(() => settle(accepted ? { status: 'still_running', reply, accepted, turnId }
      : { status: 'unconfirmed', reply, error: 'Delivery is unconfirmed. Check the destination chat before retrying; Ally did not resend it.' }), wait ? timeoutMs : Math.min(timeoutMs, 20000));
    const observe = (event: AgentEvent) => {
      if (event.kind === 'accepted' || event.kind === 'text' || event.kind === 'thinking' || (event.kind === 'tool_start' && event.id !== 'ally-desktop-connection')) {
        accepted = true;
        if (event.kind === 'accepted') turnId = event.turnId;
        if (!wait) settle({ status: 'still_running', reply, accepted: true, turnId });
      }
      if (event.kind === 'text') reply = (reply + event.text).slice(-12000);
      if (event.kind === 'done') {
        done(); clearTimeout(timer);
        settle(event.isError || event.stopped ? { status: 'error', reply, accepted, turnId, error: event.error || 'Destination response stopped' }
          : { status: 'replied', reply: reply.trim(), accepted: true, turnId });
      }
    };
    void start(observe).catch(error => { done(); clearTimeout(timer); settle({ status: 'error', reply, accepted, turnId, error: error instanceof Error ? error.message : String(error) }); });
  });
}
