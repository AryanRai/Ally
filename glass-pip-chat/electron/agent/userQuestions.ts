import http from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AgentInteractionHandler } from './types.js';

export const WATCH_QUESTION_INSTRUCTIONS = `For questions that require this watch user's answer, call the ally_watch ask_user MCP tool and await its result. This is the watch's connected input channel. Plain-text questions and desktop-only asynchronous question widgets do not create an actionable watch prompt. Do not sleep waiting for a reply to those. A returned answer records only what the user selected; it does not change browser settings, approve a different tool request, or override a security rejection. If the tool is unavailable or cancelled, say so and do not claim an approval is pending. For a blocked browser or tool capability, explain the exact limitation and the manual step required; do not promise that chat permission changes remove it. Unsupported URL schemes and missing browser-extension permissions are capability errors: call an error an automatic approval/security-review rejection only when the tool explicitly reports that. Never try another access path to evade a rejected action.`;

const tool = {
  name: 'ask_user',
  description: 'Ask the user 1–3 questions on their connected Ally watch and WAIT for an explicit answer. Use for clarifications and confirmation of a concrete action when needed. No answer is selected by default. Cancelling or timeout is not consent. This tool only collects human input; it does not grant tool permissions, change settings, or bypass security restrictions.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['questions'], properties: {
      questions: { type: 'array', minItems: 1, maxItems: 3, items: {
        type: 'object', additionalProperties: false, required: ['id', 'question', 'options'], properties: {
          id: { type: 'string', minLength: 1, maxLength: 80 },
          question: { type: 'string', minLength: 1, maxLength: 2000 },
          options: { type: 'array', minItems: 0, maxItems: 6, items: { type: 'string', minLength: 1, maxLength: 300 } },
        },
      } },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
};

function questions(value: any) {
  if (!Array.isArray(value?.questions) || !value.questions.length || value.questions.length > 3) throw new Error('Provide 1–3 questions');
  const ids = new Set<string>();
  return value.questions.map((q: any) => {
    if (typeof q?.id !== 'string' || !q.id.trim() || q.id.length > 80 || ids.has(q.id)
      || typeof q.question !== 'string' || !q.question.trim() || q.question.length > 2000
      || !Array.isArray(q.options) || q.options.length > 6
      || q.options.some((o: unknown) => typeof o !== 'string' || !o.trim() || o.length > 300)
      || new Set(q.options).size !== q.options.length) throw new Error('Invalid question or options');
    ids.add(q.id);
    return { id: q.id, question: q.question, isOther: true, options: q.options.map((label: string) => ({ label })) };
  });
}

/** A private, turn-scoped MCP input channel. Only authenticated tool calls reach the UI. */
export async function startUserQuestions(interact: AgentInteractionHandler) {
  const token = randomBytes(32).toString('hex');
  const pending = new Set<AbortController>();
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let id: unknown = null;
    const reply = (result: unknown) => {
      if (!res.destroyed) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id, result })); }
    };
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16000) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const message = JSON.parse(Buffer.concat(chunks).toString());
      id = message.id;
      if (id == null) { res.writeHead(202).end(); return; }
      if (message.method === 'initialize') {
        reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'ally-watch-input', version: '1' }, instructions: WATCH_QUESTION_INSTRUCTIONS });
      } else if (message.method === 'tools/list') reply({ tools: [tool] });
      else if (message.method === 'ping') reply({});
      else if (message.method === 'tools/call' && message.params?.name === tool.name) {
        const parsed = questions(message.params.arguments);
        const controller = new AbortController(); pending.add(controller);
        const cancel = () => controller.abort(); res.on('close', cancel);
        try {
          const result = await interact('item/tool/requestUserInput', { questions: parsed }, controller.signal) as { answers?: Record<string, unknown> };
          reply({ content: [{ type: 'text', text: JSON.stringify({ status: Object.keys(result?.answers ?? {}).length ? 'answered' : 'cancelled', ...result }) }] });
        } finally { pending.delete(controller); res.off('close', cancel); }
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown method or tool' } }));
      }
    } catch (error) {
      reply({ isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Question unavailable' }] });
    }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address() as { port: number };
  return {
    config: { url: `http://127.0.0.1:${address.port}/mcp`, http_headers: { Authorization: `Bearer ${token}` }, tool_timeout_sec: 660 },
    close: () => { for (const controller of pending) controller.abort(); pending.clear(); server.close(); server.closeAllConnections(); },
  };
}
