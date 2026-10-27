import { EventEmitter } from 'node:events';

export type LiveStudyReply = { key: string; id: string; question: string; text: string; working: boolean; activity: string; startedAt: number };

/** Presentation only: bounded latest replies, coalesced without polling history. */
export class StudyReplyFeed {
  private rows = new Map<string, LiveStudyReply>();
  private events = new EventEmitter();
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  read(key: string) { return this.rows.get(key) ?? null; }
  publish(reply: LiveStudyReply) {
    this.rows.delete(reply.key);
    this.rows.set(reply.key, { ...reply, question: reply.question.slice(0, 12000), text: reply.text.slice(0, 64001) });
    while (this.rows.size > 16) this.rows.delete(this.rows.keys().next().value!);
    if (this.pending.has(reply.key)) return;
    this.pending.set(reply.key, setTimeout(() => {
      this.pending.delete(reply.key);
      const current = this.read(reply.key);
      if (current) this.events.emit('reply', current);
    }, 50));
  }
  finish(id: string, text: string, activity: string) {
    const row = [...this.rows.values()].find(row => row.id === id);
    if (row) this.publish({ ...row, text, activity, working: false });
  }
  subscribe(callback: (reply: LiveStudyReply) => void) { this.events.on('reply', callback); return () => { this.events.off('reply', callback); }; }
  close() { for (const timer of this.pending.values()) clearTimeout(timer); this.pending.clear(); this.rows.clear(); }
}
export const liveStudyReplies = new StudyReplyFeed();
