import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setImmediate as yieldToIO } from 'node:timers/promises';
import { canonicalTurnId } from './codexDesktop.js';
import { rebuildCodexHistoryAsync } from './sessions.js';
import type { AgentHistoryMessage } from './types.js';

/**
 * Before account profiles shared Codex's databases, each account tracked its own current session
 * file for a chat, so turns run on one account landed in a file the others never read. This finds
 * those turns in the chat's other session files so the chat shows everything that happened.
 * Files are only read, and only turns missing from Codex's own view are added.
 */

interface Group { id: string; start: string; records: any[] }
interface Parsed { ino: number; offset: number; tail: string; matches?: boolean; groups: Group[]; current?: Group }

const strip = (file: string) => path.resolve(file.replace(/^\\\\\?\\/, '')).toLowerCase();

export class CodexBranchTurns {
  private files = new Map<string, Parsed>();
  private listing?: { at: number; names: string[] };
  constructor(private readonly sessionsDir: string, private readonly now = Date.now) {}

  /** Session files are named after the chat; a short-lived listing keeps repeated loads cheap. */
  private async sessionFiles(): Promise<string[]> {
    if (this.listing && this.now() - this.listing.at < 60_000) return this.listing.names;
    const names: string[] = [];
    const walk = async (dir: string, depth: number) => {
      let entries: import('node:fs').Dirent[] = [];
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && depth < 3) await walk(full, depth + 1);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) names.push(full);
      }
    };
    await walk(this.sessionsDir, 0);
    this.listing = { at: this.now(), names };
    return names;
  }

  /** Reads only what was appended since the last read of the same file. */
  private async parse(id: string, file: string): Promise<Parsed | undefined> {
    const stat = await fs.stat(file).catch(() => undefined);
    if (!stat) return;
    let parsed = this.files.get(file);
    if (!parsed || parsed.ino !== stat.ino || stat.size < parsed.offset) parsed = { ino: stat.ino, offset: 0, tail: '', groups: [] };
    if (stat.size > parsed.offset) {
      const handle = await fs.open(file, 'r');
      try {
        const chunk = 4 * 1024 * 1024;
        let position = parsed.offset, deadline = performance.now() + 8;
        while (position < stat.size) {
          const buffer = Buffer.alloc(Math.min(chunk, stat.size - position));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
          if (!bytesRead) break;
          position += bytesRead;
          const lines = (parsed.tail + buffer.toString('utf8', 0, bytesRead)).split('\n');
          parsed.tail = lines.pop() ?? '';
          for (const line of lines) {
            if (performance.now() >= deadline) { await yieldToIO(); deadline = performance.now() + 8; }
            if (!line.trim()) continue;
            let record: any;
            try { record = JSON.parse(line); } catch { continue; }
            const p = record.payload;
            if (parsed.matches === undefined) {
              // The first record names the chat; anything else is not this chat's file.
              parsed.matches = record.type === 'session_meta' && p?.id === id;
              if (!parsed.matches) break;
              continue;
            }
            if (record.type === 'event_msg' && p?.type === 'task_started') {
              const turn = canonicalTurnId(p.turn_id);
              if (turn && (!p.thread_id || p.thread_id === id)) { parsed.current = { id: turn, start: String(record.timestamp ?? ''), records: [] }; parsed.groups.push(parsed.current); }
            }
            // Never invent a turn from an unanchored fragment.
            if (parsed.current) parsed.current.records.push(record);
          }
          if (parsed.matches === false) break;
        }
        parsed.offset = parsed.matches === false ? stat.size : position - Buffer.byteLength(parsed.tail);
        parsed.tail = '';
      } finally { await handle.close(); }
    }
    this.files.set(file, parsed);
    while (this.files.size > 16) this.files.delete(this.files.keys().next().value!);
    return parsed.matches ? parsed : undefined;
  }

  /** Turns of this chat found in its other session files and missing from `known`. */
  async read(id: string, currentPath: string | undefined, known: Set<string>): Promise<{ revision: string; messages: AgentHistoryMessage[] } | undefined> {
    const current = currentPath ? strip(currentPath) : undefined;
    const files = (await this.sessionFiles()).filter(file => path.basename(file).includes(id) && strip(file) !== current);
    const found = new Map<string, Group>();
    for (const file of files) {
      const parsed = await this.parse(id, file);
      for (const group of parsed?.groups ?? []) {
        if (known.has(group.id) || found.has(group.id)) continue;
        if (!group.records.some(r => r.type === 'response_item' && r.payload?.type === 'message' && r.payload.role === 'user')) continue;
        found.set(group.id, group);
      }
    }
    if (!found.size) return;
    const groups = [...found.values()].sort((a, b) => a.start.localeCompare(b.start));
    const messages: AgentHistoryMessage[] = [];
    for (const group of groups) messages.push(...(await rebuildCodexHistoryAsync(group.records)).messages);
    const revision = createHash('sha256').update(JSON.stringify(groups.map(g => [g.id, g.records.length]))).digest('hex');
    return { revision, messages };
  }
}

/** Adds turns found elsewhere in time order, without reordering the chat's own messages. */
export function mergeBranchMessages(base: AgentHistoryMessage[], extra: AgentHistoryMessage[]): AgentHistoryMessage[] {
  if (!extra.length) return base;
  const merged = [...base];
  for (const message of extra) {
    let at = merged.length;
    while (at > 0 && merged[at - 1].timestamp > message.timestamp) at--;
    merged.splice(at, 0, message);
  }
  return merged;
}
