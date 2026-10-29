import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodegraphPool } from './codegraphPool';

/** A fake CodeGraph over stdio: answers initialize and tools/call, and can ask for roots. */
function fakeSpawn() {
  const children: any[] = [];
  const spawn = vi.fn((_command: string, args: string[]) => {
    const child: any = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), exitCode: null, kill: vi.fn(() => { child.exitCode = 0; child.emit('exit', 0); }) });
    child.args = args; child.received = [] as any[];
    let buffer = '';
    child.stdin.on('data', (data: Buffer) => {
      buffer += data.toString();
      for (let i; (i = buffer.indexOf('\n')) >= 0;) {
        const message = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1);
        child.received.push(message);
        if (message.method === 'initialize') child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'codegraph' } } }) + '\n');
        if (message.method === 'tools/call') setTimeout(() => child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `answer ${message.params.arguments.q}` }] } }) + '\n'), message.params.arguments.delay ?? 0);
      }
    });
    children.push(child);
    return child;
  });
  return { spawn, children };
}

const pools: CodegraphPool[] = [];
const dirs: string[] = [];
afterEach(() => { pools.splice(0).forEach(p => p.stop()); dirs.splice(0).forEach(d => fs.rmSync(d, { recursive: true, force: true })); });
function folder() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-cg-')); dirs.push(dir); return dir; }

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, session: res.headers.get('mcp-session-id'), json: res.status === 200 ? await res.json() : undefined };
}

describe('shared CodeGraph per folder', () => {
  it('starts one server for two agents in the same folder and keeps their replies apart', async () => {
    const { spawn, children } = fakeSpawn();
    const pool = new CodegraphPool({ command: 'node', prefixArgs: ['shim.js'], shell: false }, spawn as any); pools.push(pool);
    await pool.start();
    const dir = folder(), url = pool.url(dir)!;
    const a = await post(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    const b = await post(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    expect(a.json.result.protocolVersion).toBe('2025-03-26');
    expect(b.json.result.serverInfo.name).toBe('codegraph');
    expect(a.session).toBeTruthy();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(children[0].args).toEqual(['shim.js', 'serve', '--mcp', '--path', path.resolve(dir)]);
    // Both agents use id 7; the slower reply must still reach its own caller.
    const [slow, fast] = await Promise.all([
      post(url, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'explore', arguments: { q: 'slow', delay: 40 } } }),
      post(url, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'explore', arguments: { q: 'fast' } } }),
    ]);
    expect(slow.json).toMatchObject({ id: 7, result: { content: [{ text: 'answer slow' }] } });
    expect(fast.json).toMatchObject({ id: 7, result: { content: [{ text: 'answer fast' }] } });
    expect(children[0].received.filter((m: any) => m.method === 'initialize')).toHaveLength(1);
    expect((await post(url, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
  });

  it('uses a separate server per folder and refuses web pages and wrong secrets', async () => {
    const { spawn } = fakeSpawn();
    const pool = new CodegraphPool({ command: 'node', prefixArgs: [], shell: false }, spawn as any); pools.push(pool);
    await pool.start();
    const one = pool.url(folder())!, two = pool.url(folder())!;
    await post(one, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    await post(two, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect((await post(one, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { origin: 'https://example.test' })).status).toBe(404);
    expect((await post(one.replace(/codegraph\/[0-9a-f]{48}/, `codegraph/${'0'.repeat(48)}`), { jsonrpc: '2.0', id: 2, method: 'tools/list' })).status).toBe(404);
    expect(pool.url(path.join(folder(), 'missing'))).toBeUndefined();
  });

  it('closes an idle server only when no turn holds it, and starts it again on the next request', async () => {
    const { spawn, children } = fakeSpawn();
    let clock = 0;
    const pool = new CodegraphPool({ command: 'node', prefixArgs: [], shell: false }, spawn as any, () => clock, 1000); pools.push(pool);
    await pool.start();
    const dir = folder(), url = pool.url(dir)!;
    const release = pool.acquire(dir);
    await post(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    clock += 5000; pool.reap();
    expect(pool.running()).toHaveLength(1);
    release(); clock += 5000; pool.reap();
    expect(pool.running()).toHaveLength(0);
    expect(children[0].kill).toHaveBeenCalled();
    const again = await post(url, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'explore', arguments: { q: 'back' } } });
    expect(again.json).toMatchObject({ id: 3, result: { content: [{ text: 'answer back' }] } });
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('answers a crashed call with an error and recovers on the next one', async () => {
    const { spawn, children } = fakeSpawn();
    const pool = new CodegraphPool({ command: 'node', prefixArgs: [], shell: false }, spawn as any); pools.push(pool);
    await pool.start();
    const url = pool.url(folder())!;
    await post(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const pending = post(url, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'explore', arguments: { q: 'lost', delay: 500 } } });
    await new Promise(r => setTimeout(r, 30));
    children[0].exitCode = 1; children[0].emit('exit', 1); // watchdog kill
    expect((await pending).json).toMatchObject({ id: 2, error: { message: expect.stringContaining('restarted') } });
    const next = await post(url, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'explore', arguments: { q: 'ok' } } });
    expect(next.json).toMatchObject({ id: 3, result: { content: [{ text: 'answer ok' }] } });
  });

  it('answers the server\'s request for roots with the folder', async () => {
    const { spawn, children } = fakeSpawn();
    const pool = new CodegraphPool({ command: 'node', prefixArgs: [], shell: false }, spawn as any); pools.push(pool);
    await pool.start();
    const dir = folder(), url = pool.url(dir)!;
    await post(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    children[0].stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 'r1', method: 'roots/list' }) + '\n');
    await new Promise(r => setTimeout(r, 20));
    const reply = children[0].received.find((m: any) => m.id === 'r1');
    expect(reply.result.roots[0].name).toBe(path.basename(dir));
  });
});
