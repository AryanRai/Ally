import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

type Peer = { socket: net.Socket; profileId: string; pending: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }> };
/** Uses the installed Ally native-messaging host, independent of cua_repl focus. */
export class ChromeBridge {
  private peers = new Map<string, Peer>();
  private sockets = new Set<net.Socket>();
  private server?: net.Server;
  private token = randomBytes(32).toString('hex');
  private file?: string;
  private waiters = new Set<() => void>();
  private disconnectedAt?: string;
  private closed = false;
  /** Wait only before dispatch. Never replay a command whose outcome is unknown. */
  async waitForConnection(profileId?: string, timeoutMs = 2500): Promise<boolean> {
    const available = () => profileId ? this.peers.has(profileId) : this.peers.size > 0;
    if (available()) return true;
    if (this.closed) return false;
    return new Promise(resolve => {
      const finish = () => { if (!available() && !this.closed) return; clearTimeout(timer); this.waiters.delete(finish); resolve(available()); };
      const timer = setTimeout(() => { this.waiters.delete(finish); resolve(available()); }, timeoutMs);
      this.waiters.add(finish); finish();
    });
  }
  status() { return { state: this.peers.size ? 'connected' : 'disconnected', connectedProfiles: this.peers.size,
    busyProfiles: [...this.peers.values()].filter(peer => peer.pending.size > 0).length,
    ...(this.disconnectedAt ? { lastDisconnectedAt: this.disconnectedAt } : {}),
    recovery: 'The extension reconnects automatically. If Chrome is open but remains disconnected, open the Ally extension popup for its exact host/setup error. No browser action has been retried.' }; }
  async listen(profile: string) {
    const pipe = `ally-browser-${randomBytes(16).toString('hex')}`;
    this.server = net.createServer(socket => this.accept(socket));
    await new Promise<void>((resolve, reject) => { this.server!.once('error', reject); this.server!.listen(`\\\\.\\pipe\\${pipe}`, resolve); });
    this.file = path.join(profile, 'browser-agent-bridge.txt');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(this.file + '.staged', `${pipe}\n${this.token}\n`, { mode: 0o600 });
    fs.renameSync(this.file + '.staged', this.file);
  }
  private accept(socket: net.Socket) {
    this.sockets.add(socket); socket.setEncoding('utf8');
    let buffer = '', authenticated = false, peer: Peer | undefined;
    const authTimer = setTimeout(() => socket.destroy(), 3000);
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 9 * 1024 * 1024) { socket.destroy(); return; }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        if (!authenticated) {
          if (line !== `AUTH ${this.token}`) { socket.destroy(); return; }
          authenticated = true; clearTimeout(authTimer); continue;
        }
        try {
          const value = JSON.parse(line);
          if (value.type === 'hello' && typeof value.profileId === 'string' && /^[\w-]{1,100}$/.test(value.profileId) && !peer) {
            if (this.peers.has(value.profileId)) { socket.destroy(); return; }
            peer = { socket, profileId: value.profileId, pending: new Map() }; this.peers.set(peer.profileId, peer);
            for (const notify of this.waiters) notify();
          } else if (value.type === 'result' && peer) {
            const pending = peer.pending.get(value.id); if (!pending) continue;
            peer.pending.delete(value.id); clearTimeout(pending.timer);
            value.error ? pending.reject(Error(String(value.error).slice(0, 2000))) : pending.resolve(value.result);
          } else if (value.type === 'stop' && peer) {
            for (const pending of peer.pending.values()) { clearTimeout(pending.timer); pending.reject(Error('Browser control stopped in the Ally extension. Inspect before retrying.')); }
            peer.pending.clear();
          }
        } catch { socket.destroy(); }
      }
    });
    socket.on('close', () => {
      clearTimeout(authTimer); this.sockets.delete(socket);
      if (peer && this.peers.get(peer.profileId) === peer) { this.peers.delete(peer.profileId); this.disconnectedAt = new Date().toISOString(); }
      if (peer) for (const pending of peer.pending.values()) { clearTimeout(pending.timer); pending.reject(Error('Ally Chrome extension disconnected. Outcome may be unknown; inspect before retrying.')); }
    });
  }
  list() { return [...this.peers.keys()].map(profileId => ({ profileId, connected: true })); }
  async request(profileId: string, command: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw Error('Browser request cancelled before dispatch.');
    await this.waitForConnection(profileId);
    if (signal?.aborted) throw Error('Browser request cancelled before dispatch.');
    const peer = this.peers.get(profileId);
    if (!peer) return Promise.reject(Error('Ally Chrome extension is not connected. Open its popup and reconnect, or use the Ally browser.'));
    if (peer.pending.size) return Promise.reject(Error('This Chrome profile already has an active browser command.'));
    const id = 'ally-mcp-' + randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { peer.pending.delete(id); reject(Error('Chrome command timed out. Outcome may be unknown; inspect before retrying.')); }, 25000);
      peer.pending.set(id, { resolve, reject, timer });
      peer.socket.write(JSON.stringify({ ...command, id, type: 'command' }) + '\n', error => {
        if (error && peer.pending.delete(id)) {
          clearTimeout(timer);
          if (this.peers.get(profileId) === peer) { this.peers.delete(profileId); this.disconnectedAt = new Date().toISOString(); }
          peer.socket.destroy();
          reject(Error('Chrome transport write failed. Outcome may be unknown; inspect before retrying.'));
        }
      });
    });
  }
  close() {
    this.closed = true;
    for (const notify of this.waiters) notify();
    for (const socket of this.sockets) socket.destroy();
    this.server?.close();
    try { if (this.file && fs.readFileSync(this.file, 'utf8').includes(this.token)) fs.rmSync(this.file); } catch {}
  }
}
