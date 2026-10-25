import type { ServerResponse } from 'node:http';

export type NativeStreamEvent = { type: 'snapshot' | 'text'; text: string } | { type: 'reset' } | { type: 'done'; text: string } | { type: 'error'; error: string };
/** Active native turns push deltas over one connection; no history or turn polling. */
export class NativeTurnStreams {
  private clients = new Map<string, Set<ServerResponse>>();
  private write(res: ServerResponse, event: NativeStreamEvent) {
    if (res.destroyed) return;
    // Disconnect a stalled consumer rather than accumulate an unbounded socket queue.
    if (res.writableLength > 256000) { res.destroy(); return; }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  open(id: string, res: ServerResponse, initial: NativeStreamEvent) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.flushHeaders();
    this.write(res, initial);
    if (initial.type === 'done' || initial.type === 'error') { res.end(); return; }
    const clients = this.clients.get(id) ?? new Set<ServerResponse>(); this.clients.set(id, clients); clients.add(res);
    const keepalive = setInterval(() => { if (!res.destroyed) res.write(': working\n\n'); }, 10000);
    res.once('close', () => { clearInterval(keepalive); clients.delete(res); if (!clients.size) this.clients.delete(id); });
  }
  publish(id: string, event: NativeStreamEvent) {
    for (const res of this.clients.get(id) ?? []) {
      this.write(res, event);
      if (event.type === 'done' || event.type === 'error') res.end();
    }
  }
  close() { for (const clients of this.clients.values()) for (const res of clients) res.destroy(); this.clients.clear(); }
}
