import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Native source, never the editable display name or a fork/parent alone. */
export function internalCodexSource(meta: any): boolean {
  let source = meta?.source;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { /* ordinary enum */ }
  }
  const kind = typeof source === 'string' ? source : source?.type ?? source?.kind;
  return (typeof kind === 'string' && /^sub_?agent/i.test(kind))
    || !!(source && typeof source === 'object' && ('subagent' in source || 'subAgent' in source))
    || ['guardian_review', 'guardianReview'].includes(meta?.thread_source ?? meta?.threadSource);
}
type Metadata = { internal: boolean; title?: string; createdAt?: number };

/** Reads only the bounded session header. File revisions invalidate cached
 * metadata; missing/new files are retried after the directory index expires.
 * No conversation bodies, receipt acknowledgements or database writes. */
export class CodexDiscovery {
  private files = new Map<string, string[]>();
  private indexedAt = -Infinity;
  private titles = new Map<string, string>();
  private headers = new Map<string, { revision: string; value?: Metadata }>();
  constructor(private home = os.homedir(), private now = Date.now) {}
  remember(meta: any): Metadata | undefined {
    if (!meta || (meta.source === undefined && meta.thread_source === undefined && meta.threadSource === undefined)) return undefined;
    return { internal: internalCodexSource(meta), title: meta.name, createdAt: meta.createdAt ? meta.createdAt * 1000 : undefined };
  }
  private index() {
    if (this.now() - this.indexedAt < 5000) return;
    const files = new Map<string, string[]>();
    const walk = (dir: string, depth: number) => {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory() && depth > 0) walk(file, depth - 1);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const id = entry.name.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0];
          if (id) files.set(id, [...files.get(id) ?? [], file]);
        }
      }
    };
    walk(path.join(this.home, '.codex', 'sessions'), 4);
    walk(path.join(this.home, '.codex', 'archived_sessions'), 4);
    this.files = files; this.indexedAt = this.now();
    try {
      const titles = new Map<string, string>();
      for (const line of fs.readFileSync(path.join(this.home, '.codex', 'session_index.jsonl'), 'utf8').split('\n')) {
        try { const row = JSON.parse(line); if (row.id && row.thread_name) titles.set(row.id, row.thread_name); } catch { /* partial index */ }
      }
      this.titles = titles;
    } catch { /* optional title index */ }
    const indexed = new Set([...files.values()].flat());
    for (const file of this.headers.keys()) if (!indexed.has(file)) this.headers.delete(file);
  }
  file(file: string): Metadata | undefined {
    let fd: number | undefined;
    try {
      const stat = fs.statSync(file), revision = `${stat.ino}:${stat.birthtimeMs}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      const old = this.headers.get(file);
      if (old?.revision === revision) return old.value;
      fd = fs.openSync(file, 'r');
      const buffer = Buffer.alloc(Math.min(stat.size, 65536));
      const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
      const line = buffer.subarray(0, length).toString('utf8').split('\n')[0];
      const record = JSON.parse(line);
      const value = record.type === 'session_meta' ? this.remember(record.payload) : undefined;
      this.headers.set(file, { revision, value });
      return value;
    } catch { return undefined; }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  get(id: string): Metadata | undefined {
    this.index();
    const values = (this.files.get(id) ?? []).map(file => this.file(file)).filter((v): v is Metadata => !!v);
    // A continuation can omit metadata; a positive native source wins.
    const value = values.find(v => v.internal) ?? values[0];
    return value && { ...value, title: this.titles.get(id) ?? value.title };
  }
  paths(id: string): string[] {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return [];
    this.index();
    return [...this.files.get(id) ?? []];
  }
}
const local = new CodexDiscovery();
const native = new Map<string, { at: number; value?: Metadata }>();
const pending = new Map<string, Promise<void>>();
let readMetadata: ((id: string) => Promise<any>) | undefined;
export function configureDiscoveryReader(read: (id: string) => Promise<any>) { readMetadata = read; }
export function rememberCodexThread(thread: any) {
  if (thread?.id && (thread.source !== undefined || thread.threadSource !== undefined || thread.thread_source !== undefined))
    native.set(thread.id, { at: Date.now(), value: local.remember(thread) });
}
export function codexDiscovery(id: string) { return local.get(id) ?? native.get(id)?.value; }
export const codexRolloutPaths = (id: string) => local.paths(id);
export const hiddenConversation = (provider: string, id: string) => provider === 'codex' && codexDiscovery(id)?.internal === true;
/** At most two metadata-only RPCs at once, deduplicated and cached including
 * failures. A missing source stays reachable; titles never imply exclusion. */
export async function resolveCodexDiscovery(id: string) {
  if (pending.has(id)) return pending.get(id);
  if (local.get(id) || !readMetadata || Date.now() - (native.get(id)?.at ?? 0) < 300000) return;
  while (pending.size >= 2) await Promise.race(pending.values());
  if (pending.has(id)) return pending.get(id);
  if (Date.now() - (native.get(id)?.at ?? 0) < 300000) return;
  native.set(id, { ...native.get(id), at: Date.now() });
  const task = readMetadata(id).then(rememberCodexThread).catch(() => {}).finally(() => { pending.delete(id); });
  pending.set(id, task); await task;
}
