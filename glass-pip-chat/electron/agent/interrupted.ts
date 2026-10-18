import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

export { RESUME_PROMPT } from './resumePrompt.js';
export interface InterruptedSession { token: string; stoppedAt: number }

/** A shared receipt for an explicit Stop. Resume always starts a new turn in that same session. */
export class InterruptedSessions {
  private file?: string;
  private entries: Record<string, InterruptedSession> = {};
  configure(file: string) {
    this.file = file; this.entries = {};
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [key, value] of Object.entries(saved)) {
        const entry = value as InterruptedSession;
        if (entry && typeof entry.token === 'string' && Number.isFinite(entry.stoppedAt)) this.entries[key] = entry;
      }
    } catch { /* First use or damaged cache. */ }
  }
  read(key: string) { return this.entries[key]; }
  stopped(key: string) {
    this.entries[key] = { token: randomUUID(), stoppedAt: Date.now() };
    this.save();
  }
  starting(key: string, token?: string) {
    if (token !== undefined && (!token || this.entries[key]?.token !== token)) throw Error('This stopped response has changed. Refresh the chat before resuming.');
    if (this.entries[key]) { delete this.entries[key]; this.save(); }
  }
  observe(key: string, latestUserAt: number) {
    const stopped = this.entries[key];
    if (stopped && latestUserAt > stopped.stoppedAt) this.starting(key);
  }
  private save() {
    try { if (this.file) fs.writeFileSync(this.file, JSON.stringify(this.entries)); }
    catch { /* Keep the in-memory receipt; persistence must not interrupt run cleanup. */ }
  }
}
export const interruptedSessions = new InterruptedSessions();
