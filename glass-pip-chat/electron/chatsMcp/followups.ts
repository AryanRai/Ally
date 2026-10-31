import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fail, text, type ToolDef } from './protocol.js';

/**
 * Follow-ups an agent asks for: "wake this chat when the timer ends, the process exits or the file
 * appears". The agent starts its own long work inside its own access; Ally only watches and, when the
 * trigger fires, sends the agent's note back into the same chat as a new message so it picks up there.
 * Nothing here runs a command or grants access.
 */
export interface Followup {
  id: string; chat: string; note: string; createdAt: number;
  at?: number; pid?: number; path?: string; deadline: number;
}
export interface FollowupDeps {
  file: string;
  now: () => number;
  alive: (pid: number) => boolean;
  exists: (path: string) => boolean;
  wake: (chat: string, text: string) => Promise<void>;
}

const MINUTE = 60_000;
const MAX_WAIT = 7 * 24 * 60 * MINUTE;
const PER_CHAT = 20;

export function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

export class Followups {
  private items: Followup[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private firing = new Set<string>();
  constructor(private deps: FollowupDeps) {
    try {
      const saved = JSON.parse(fs.readFileSync(deps.file, 'utf8'));
      if (Array.isArray(saved)) this.items = saved.filter(f => f && typeof f.id === 'string' && typeof f.chat === 'string' && typeof f.note === 'string' && Number.isFinite(f.deadline));
    } catch { /* none yet */ }
  }
  private save() { fs.writeFileSync(this.deps.file, JSON.stringify(this.items, null, 2)); }

  schedule(chat: string, args: Record<string, unknown>): Followup {
    const note = typeof args.note === 'string' ? args.note.trim() : '';
    if (!note || note.length > 2000) throw Error('Write the note to yourself: what to do when this fires (up to 2000 characters).');
    const minutes = args.afterMinutes, pid = args.pid, path = args.path;
    const triggers = [minutes, pid, path].filter(v => v !== undefined && v !== null);
    if (triggers.length !== 1) throw Error('Give exactly one trigger: afterMinutes, pid or path.');
    if (this.items.filter(f => f.chat === chat).length >= PER_CHAT) throw Error(`This chat already has ${PER_CHAT} follow-ups. Cancel one first.`);
    const now = this.deps.now();
    const limit = typeof args.timeoutMinutes === 'number' && args.timeoutMinutes >= 1 ? Math.min(args.timeoutMinutes * MINUTE, MAX_WAIT) : 24 * 60 * MINUTE;
    const item: Followup = { id: randomUUID(), chat, note, createdAt: now, deadline: now + limit };
    if (minutes !== undefined) {
      if (typeof minutes !== 'number' || !(minutes >= 1) || minutes * MINUTE > MAX_WAIT) throw Error('afterMinutes must be between 1 and 10080 (7 days).');
      item.at = now + Math.round(minutes * MINUTE); item.deadline = item.at;
    } else if (pid !== undefined) {
      if (!Number.isInteger(pid) || (pid as number) <= 0) throw Error('pid must be the process id of the job you started.');
      if (!this.deps.alive(pid as number)) throw Error(`Process ${pid} is not running, so it has already finished. Continue now instead.`);
      item.pid = pid as number;
    } else {
      if (typeof path !== 'string' || !path.trim() || path.length > 1000) throw Error('path must be the file the job will create.');
      if (this.deps.exists(path)) throw Error('That file already exists. Continue now instead.');
      item.path = path;
    }
    this.items.push(item); this.save();
    return item;
  }
  list(chat: string) { return this.items.filter(f => f.chat === chat); }
  cancel(chat: string, id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter(f => !(f.chat === chat && f.id === id));
    if (this.items.length === before) return false;
    this.save(); return true;
  }

  /** Why a follow-up fires, or undefined while it keeps waiting. */
  private reason(f: Followup, now: number): string | undefined {
    if (f.at !== undefined) return now >= f.at ? `the ${Math.round((f.at - f.createdAt) / MINUTE)} minute timer ended` : undefined;
    if (f.pid !== undefined && !this.deps.alive(f.pid)) return `process ${f.pid} exited (check its output or log for the result)`;
    if (f.path !== undefined && this.deps.exists(f.path)) return `${f.path} now exists`;
    if (now >= f.deadline) return `it timed out after ${Math.round((f.deadline - f.createdAt) / MINUTE)} minutes without the ${f.pid !== undefined ? 'process exiting' : 'file appearing'}`;
    return undefined;
  }
  async check(): Promise<void> {
    const now = this.deps.now();
    for (const f of [...this.items]) {
      if (this.firing.has(f.id)) continue;
      const why = this.reason(f, now);
      if (!why) continue;
      this.firing.add(f.id);
      // Removed before waking, so a crash or slow delivery can never wake the chat twice.
      this.items = this.items.filter(x => x.id !== f.id); this.save();
      try { await this.deps.wake(f.chat, `[Ally follow-up you scheduled: ${why}. Pick up from here.]\n\n${f.note}`); }
      catch { /* The chat shows nothing new; the agent's note is lost rather than repeated. */ }
      finally { this.firing.delete(f.id); }
    }
  }
  start(intervalMs = 15_000) { this.stop(); void this.check(); this.timer = setInterval(() => void this.check(), intervalMs); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
}

export function followupTool(store: Followups): ToolDef {
  return { name: 'chat_followup', description: 'Background callback for long work: start the job yourself (in the background, within your access), then schedule a follow-up and end your turn. When the timer ends, the process exits or the file appears, Ally sends your note back into this same chat as a new message so you pick up and finish (report, message someone, check again). Use afterMinutes for "check again later" (schedule another on wake to keep polling). list and cancel manage this chat\'s follow-ups. Nothing runs until the trigger, and a follow-up fires once.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['action'], properties: {
      action: { type: 'string', enum: ['schedule', 'list', 'cancel'] }, chatId: { type: 'string' },
      note: { type: 'string', maxLength: 2000, description: 'What to do when it fires, written to your future self.' },
      afterMinutes: { type: 'number', minimum: 1, maximum: 10080 }, pid: { type: 'integer', minimum: 1, description: 'Process id of the background job you started.' },
      path: { type: 'string', maxLength: 1000, description: 'File the job creates when done.' }, timeoutMinutes: { type: 'number', minimum: 1, maximum: 10080, description: 'For pid/path: wake anyway after this long (default 24 hours).' },
      id: { type: 'string', description: 'Follow-up id to cancel.' } } },
    annotations: { readOnlyHint: false, title: 'Follow-up' },
    handler: async (args, ctx) => {
      const chat = ctx.caller ?? args.chatId;
      if (typeof chat !== 'string' || !/^(codex|claude):[\w.-]{8,200}$/.test(chat) || (ctx.caller && args.chatId && args.chatId !== ctx.caller)) return fail('Run this from the chat that should be woken, or pass its chatId as provider:sessionId.');
      try {
        if (args.action === 'list') return text(JSON.stringify({ followups: store.list(chat) }));
        if (args.action === 'cancel') return store.cancel(chat, String(args.id ?? '')) ? text('Cancelled.') : fail('No such follow-up in this chat.');
        const item = store.schedule(chat, args);
        return text(JSON.stringify({ scheduled: item, message: 'Scheduled. End your turn now; this chat gets a new message when it fires.' }));
      } catch (error) { return fail((error as Error).message); }
    } };
}
