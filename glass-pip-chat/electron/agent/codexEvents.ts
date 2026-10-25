import { extractImages, stringifyToolOutput } from './parsers.js';
import { localImageDataUrl } from './imageFile.js';
import type { AgentEvent, AgentUsage } from './types.js';

/** Codex relays some backend errors as raw JSON; turn the known ones into a next step. */
export function codexErrorMessage(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let detail = raw;
  try { const parsed = JSON.parse(raw); detail = parsed?.error?.message ?? parsed?.detail ?? raw; } catch { /* plain text */ }
  const unsupported = /The '([^']+)' model is not supported when using Codex with a ChatGPT account/i.exec(detail);
  if (unsupported) return `This chat uses ${unsupported[1]}, which your ChatGPT account no longer supports. Choose another model for this chat in Codex, then send again. Your message was not answered.`;
  return detail;
}

/** Normalizes the documented app-server item stream, without duplicating deltas on completion. */
export class CodexEventParser {
  private phases = new Map<string, 'commentary' | 'final_answer'>();
  private streamed = new Set<string>();
  private started = new Set<string>();
  private output = new Map<string, string>();
  private progress = new Map<string, Record<string, unknown>>();
  usage?: AgentUsage;
  constructor(readonly sessionId: string) {}

  handle(method: string, p: any): AgentEvent[] {
    if (p.threadId && p.threadId !== this.sessionId) return [];
    if (method === 'thread/tokenUsage/updated') {
      const u = p.tokenUsage?.last;
      if (u) this.usage = { inputTokens: u.inputTokens, outputTokens: u.outputTokens, cachedTokens: u.cachedInputTokens };
      return [];
    }
    if (method === 'item/agentMessage/delta' || method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') {
      this.streamed.add(p.itemId);
      return [{ kind: method === 'item/agentMessage/delta' ? 'text' : 'thinking', text: p.delta, ...(method === 'item/agentMessage/delta' ? { itemId: p.itemId, phase: this.phases.get(p.itemId) } : {}) }];
    }
    if (method === 'item/reasoning/summaryPartAdded') return this.streamed.has(p.itemId) ? [{ kind: 'thinking', text: '\n\n' }] : [];
    if (method === 'item/commandExecution/outputDelta' || method === 'item/fileChange/outputDelta') {
      const output = ((this.output.get(p.itemId) ?? '') + p.delta).slice(-16000);
      this.output.set(p.itemId, output);
      return [{ kind: 'tool_update', id: p.itemId, input: { output } }];
    }
    if (method === 'turn/plan/updated' || method === 'turn/diff/updated') {
      const id = `${method}:${p.turnId}`;
      const input = method === 'turn/plan/updated'
        ? { plan: (p.plan ?? []).map((step: any) => ({ ...step, status: step.status === 'inProgress' ? 'in_progress' : step.status })), explanation: p.explanation }
        : { changes: [{ path: 'Turn changes', diff: p.diff }] };
      this.progress.set(id, input);
      return this.tool(id, method === 'turn/plan/updated' ? 'todo_list' : 'edit_files', input);
    }
    if (method === 'item/plan/delta') {
      const id = p.itemId;
      const text = (this.output.get(id) ?? '') + p.delta;
      this.output.set(id, text);
      return this.tool(id, 'plan', { text });
    }
    if (method === 'item/started' || method === 'item/completed') {
      const i = p.item;
      if (!i) return [];
      const complete = method === 'item/completed';
      if (i.type === 'userMessage' || i.type === 'hookPrompt') return [];
      if (i.type === 'agentMessage' || i.type === 'reasoning') {
        if (i.type === 'agentMessage' && ['commentary', 'final_answer'].includes(i.phase)) this.phases.set(i.id, i.phase);
        if (!complete) return [];
        const metadata = i.type === 'agentMessage' ? { itemId: i.id, phase: this.phases.get(i.id) } : {};
        const text = i.type === 'agentMessage' ? i.text : (i.summary?.length ? i.summary : i.content ?? []).join('\n\n');
        const out: AgentEvent[] = !this.streamed.has(i.id) && text
          ? [{ kind: i.type === 'agentMessage' ? 'text' : 'thinking', text, ...metadata }] : [];
        if (text || this.streamed.has(i.id)) out.push({ kind: i.type === 'agentMessage' ? 'text' : 'thinking', text: '\n\n', ...metadata });
        return out;
      }
      const names: Record<string, string> = { commandExecution: 'shell', fileChange: 'edit_files', webSearch: 'web_search', imageView: 'view_image', contextCompaction: 'context_compaction' };
      const name = i.type === 'mcpToolCall' ? `${i.server}.${i.tool}` : i.type === 'dynamicToolCall' ? i.tool : names[i.type] ?? i.type;
      const input = i.type === 'commandExecution' ? { command: i.command, cwd: i.cwd }
        : i.type === 'fileChange' ? { changes: i.changes }
        : i.arguments != null ? (typeof i.arguments === 'object' ? i.arguments : { arguments: i.arguments })
        : i.type === 'plan' ? { text: i.text } : { ...i };
      const out = this.tool(i.id, name, input);
      if (complete) {
        const content = i.result?.content ?? i.contentItems ?? i.output;
        const images = extractImages(content);
        if (i.type === 'imageView' && typeof i.path === 'string') {
          const image = localImageDataUrl(i.path);
          if (image) images.push(image);
        }
        // App-server image items carry a URL rather than an MCP image block.
        for (const c of Array.isArray(content) ? content : []) if (c.type === 'image' && c.imageUrl?.startsWith('data:')) images.push(c.imageUrl);
        if (i.type === 'imageGeneration' && i.result) images.push(`data:image/png;base64,${i.result}`);
        out.push({ kind: 'tool_end', id: i.id,
          output: i.error?.message ?? i.aggregatedOutput ?? (content != null ? stringifyToolOutput(content) : i.type === 'fileChange' ? JSON.stringify(i.changes) : i.text ?? this.output.get(i.id) ?? ''),
          isError: !!i.error || i.status === 'failed' || i.status === 'declined' || i.success === false || (i.exitCode != null && i.exitCode !== 0),
          ...(images.length ? { images } : {}),
        });
      }
      return out;
    }
    if (method === 'turn/completed') {
      const out: AgentEvent[] = [...this.progress].map(([id, input]) => ({ kind: 'tool_end', id, output: JSON.stringify(input), isError: p.turn?.status !== 'completed' }));
      out.push({ kind: 'done', sessionId: this.sessionId, usage: this.usage,
        isError: p.turn?.status === 'failed', error: codexErrorMessage(p.turn?.error?.message) });
      return out;
    }
    if (method === 'error' && !p.willRetry) return [{ kind: 'done', sessionId: this.sessionId, isError: true, error: codexErrorMessage(p.error?.message) ?? 'Codex turn failed' }];
    return [];
  }

  private tool(id: string, name: string, input: Record<string, unknown>): AgentEvent[] {
    if (this.started.has(id)) return [{ kind: 'tool_update', id, input }];
    this.started.add(id);
    return [{ kind: 'tool_start', id, name, input }];
  }
}
