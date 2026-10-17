import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { CodexRpc } from './codexRpc';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function connection() {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => {} });
  const sent: any[] = []; child.stdin.on('data', b => sent.push(JSON.parse(b.toString())));
  const rpc = new (CodexRpc as any)(child) as CodexRpc;
  return { child, sent, rpc };
}
describe('Codex server request transport', () => {
  it('keeps an approval pending and sends its exact JSON-RPC response after user input', async () => {
    const { child, rpc, sent } = connection();
    let answer!: (v: unknown) => void;
    rpc.onRequest = async (method, p, id) => { expect(method).toBe('mcpServer/elicitation/request'); expect(p.message).toBe('Upload?'); expect(id).toBe('approval-1'); return new Promise(resolve => { answer = resolve; }); };
    child.stdout.write(JSON.stringify({ id: 'approval-1', method: 'mcpServer/elicitation/request', params: { message: 'Upload?' } }) + '\n');
    await flush(); expect(sent).toEqual([]);
    answer({ action: 'accept', content: { allow: true } }); await flush();
    expect(sent).toEqual([{ id: 'approval-1', result: { action: 'accept', content: { allow: true } } }]); rpc.close();
  });
  it('rejects unsupported requests and never silently approves after disconnect', async () => {
    const { child, rpc, sent } = connection();
    child.stdout.write(JSON.stringify({ id: 1, method: 'unsupported', params: {} }) + '\n');
    expect(sent[0].error.code).toBe(-32601);
    let answer!: (v: unknown) => void;
    rpc.onRequest = () => new Promise(resolve => { answer = resolve; });
    child.stdout.write(JSON.stringify({ id: 2, method: 'approval', params: {} }) + '\n'); await flush(); rpc.close();
    answer({ decision: 'accept' }); await flush(); expect(sent).toHaveLength(1);
    expect(child.stdout.destroyed).toBe(true);
    expect(child.stderr.destroyed).toBe(true);
  });
});
