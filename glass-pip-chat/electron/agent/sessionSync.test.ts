// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./thumbs.js', () => ({ thumbnails: (images?: string[]) => images?.length ? images : undefined }));
import { loadAgentSession, listAgentSessions, mergeSessionRecords, rebuildCodexHistory } from './sessions';
import { STALE_TURN_MS } from './sessionActivity';

const id = '11111111-1111-1111-1111-111111111111';
const continuation = '22222222-2222-2222-2222-222222222222';
const message = (role: string, text: string, msgId: string, timestamp: string) => ({ timestamp, type: 'response_item', payload: { type: 'message', id: msgId, role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } });
const jsonl = (records: unknown[]) => records.map(r => JSON.stringify(r)).join('\n') + '\n';

describe('live on-disk sessions', () => {
  let root: string;
  let folder: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-session-test-'));
    folder = path.join(root, '.codex', 'sessions', '2026', '10', '17');
    fs.mkdirSync(folder, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(root);
  });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

  it('follows continuation files and partially written lines without duplicating the opening user message', () => {
    const first = path.join(folder, `rollout-${id}.jsonl`);
    fs.writeFileSync(first, jsonl([
      message('user', '<environment_context>old setup</environment_context>', 'env1', '2026-10-16T23:59:59Z'),
      message('user', 'Hello', 'u1', '2026-10-17T00:00:00Z'),
    ]));
    const original = loadAgentSession('codex', id);
    expect(original.messages.map(m => m.content)).toEqual(['Hello']);
    expect(loadAgentSession('codex', id, original.revision).unchanged).toBe(true);

    const next = path.join(folder, `rollout-${id}_${continuation}.jsonl`);
    fs.writeFileSync(next, jsonl([
      message('user', '<environment_context>new setup</environment_context>', 'env2', '2026-10-17T00:00:01Z'),
      message('user', 'Hello', 'replayed-user', '2026-10-17T00:00:01Z'),
      message('assistant', 'Working now', 'a1', '2026-10-17T00:00:02Z'),
    ]));
    const updated = loadAgentSession('codex', id, original.revision);
    expect(updated.messages.map(m => m.content)).toEqual(['Hello', 'Working now']);
    expect(listAgentSessions('codex').map(s => s.id)).toEqual([id]);

    const finish = JSON.stringify(message('assistant', 'Finished', 'a2', '2026-10-17T00:00:03Z'));
    fs.appendFileSync(next, finish.slice(0, 30));
    const partial = loadAgentSession('codex', id, updated.revision);
    expect(partial.messages.at(-1)?.content).toBe('Working now');
    fs.appendFileSync(next, finish.slice(30) + '\n');
    const final = loadAgentSession('codex', id, partial.revision);
    expect(final.messages.at(-1)?.content).toBe('Working now\n\nFinished');
  });

  it('replaces a root draft with the expanded continuation prompt but keeps later repeated messages', () => {
    const draft = message('user', 'Please fix this', 'u1', '2026-10-17T00:00:00Z');
    const full = message('user', 'Please fix this\nMore details', 'u2', '2026-10-17T00:00:01Z');
    const reply = message('assistant', 'Working', 'a1', '2026-10-17T00:00:02Z');
    const repeat = message('user', 'Please fix this', 'u3', '2026-10-17T00:00:03Z');
    const result = rebuildCodexHistory(mergeSessionRecords([[draft], [full, reply, repeat]]));
    expect(result.messages.map(m => m.content)).toEqual(['Please fix this\nMore details', 'Working', 'Please fix this']);
  });

  it('refreshes Claude tool completion in the same reply', () => {
    const project = path.join(root, '.claude', 'projects', 'project');
    fs.mkdirSync(project, { recursive: true });
    const file = path.join(project, `${id}.jsonl`);
    fs.writeFileSync(file, jsonl([
      { type: 'user', message: { content: 'Read' } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Read', input: { file_path: 'a.ts' } }] } },
    ]));
    const running = loadAgentSession('claude', id);
    expect(running.messages[1].segments?.[0].toolExecution?.status).toBe('executing');
    fs.appendFileSync(file, jsonl([{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'file contents' }] } }]));
    const done = loadAgentSession('claude', id, running.revision);
    expect(done.messages).toHaveLength(2);
    expect(done.messages[1].segments?.[0].toolExecution).toMatchObject({ status: 'success', result: 'file contents' });
  });

  it('expires Claude Thinking on unchanged polls and never revives it with bookkeeping', () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const project = path.join(root, '.claude', 'projects', 'project');
    fs.mkdirSync(project, { recursive: true });
    const file = path.join(project, `${id}.jsonl`);
    fs.writeFileSync(file, jsonl([{ type: 'user', timestamp: new Date(now).toISOString(), message: { content: 'show me the images' } }]));
    const fresh = loadAgentSession('claude', id);
    expect(fresh.running).toBe(true);
    clock.mockReturnValue(now + STALE_TURN_MS + 1000);
    expect(loadAgentSession('claude', id, fresh.revision)).toMatchObject({ unchanged: true, running: false });
    fs.appendFileSync(file, jsonl([{ type: 'cost-state', timestamp: new Date(Date.now()).toISOString() }]));
    fs.utimesSync(file, Date.now() / 1000, Date.now() / 1000);
    const refreshed = loadAgentSession('claude', id);
    expect(refreshed.running).toBe(false);
    expect(refreshed.messages.map(m => m.content)).toEqual(['show me the images']);
    expect(loadAgentSession('claude', id, refreshed.revision)).toMatchObject({ unchanged: true, running: false });
    fs.appendFileSync(file, jsonl([{ type: 'user', timestamp: new Date(Date.now()).toISOString(), message: { content: 'new request' } }]));
    expect(loadAgentSession('claude', id).running).toBe(true);
  });
});
