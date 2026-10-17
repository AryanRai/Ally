import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { CodexRpc } from './codexRpc.js';

type Mapping = { target?: string; startedAt: number };
let mappingFile = path.join(os.homedir(), '.ally', 'codex-migrations.json');
export function configureCodexMigrations(file: string) { mappingFile = file; }
function readMappings(): Record<string, Mapping> {
  try { return JSON.parse(fs.readFileSync(mappingFile, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw new Error('Cannot read Ally Codex migration records; restore the file before continuing.'); }
}
function saveMapping(id: string, mapping: Mapping) {
  const entries = readMappings(); entries[id] = mapping;
  fs.mkdirSync(path.dirname(mappingFile), { recursive: true });
  fs.writeFileSync(mappingFile + '.tmp', JSON.stringify(entries, null, 2));
  fs.renameSync(mappingFile + '.tmp', mappingFile);
}
export function mappedCodexSession(id: string): string { return readMappings()[id]?.target ?? id; }
export function codexMigrationAliases(): Record<string, string> {
  return Object.fromEntries(Object.entries(readMappings()).filter(([, m]) => m.target).map(([id, m]) => [id, m.target!]));
}

const migrations = new Map<string, Promise<string>>();
/** Migrate only on an explicit continuation. A read never forks or acquires a writer. */
export async function interactiveCodexSession(rpc: CodexRpc, id: string, _config: Record<string, unknown>): Promise<string> {
  if (migrations.has(id)) return migrations.get(id)!;
  const work = (async () => {
    const mapping = readMappings()[id];
    if (mapping?.target) return mapping.target;
    const original = (await rpc.request('thread/read', { threadId: id })).thread;
    if (original.source !== 'exec') return id;
    if (original.status?.type === 'active') throw new Error('This Codex chat is running. Wait for it to finish before continuing in Ally.');
    // A pending journal means a previous process may have forked before saving its
    // response. Recover a materialized fork; never create duplicate forks on retry.
    if (mapping) {
      let cursor: string | undefined;
      do {
        const page = await rpc.request('thread/list', { limit: 100, cursor, sortKey: 'created_at' });
        const recovered = page.data.find((t: any) => t.forkedFromId === id && t.createdAt >= mapping.startedAt - 1 && t.originator === 'ally');
        if (recovered) { saveMapping(id, { ...mapping, target: recovered.id }); return recovered.id; }
        cursor = page.nextCursor;
      } while (cursor);
      throw new Error('An earlier Codex history fork was interrupted before Ally saved its ID. The original chat is intact. Check the Ally migration record before retrying to avoid a duplicate fork.');
    }
    // The user requires exact-chat continuation. Keep prior migration mappings
    // readable, but never create a new fork to work around a runtime limitation.
    throw new Error('This legacy Codex exec chat cannot accept interactive messages in Ally. No fork was created; continue the original in Codex.');
  })();
  migrations.set(id, work);
  try { return await work; } finally { migrations.delete(id); }
}
