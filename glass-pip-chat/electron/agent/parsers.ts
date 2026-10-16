// Turn each CLI's JSONL output into the shared AgentEvent stream.
import type { AgentEvent } from './types.js';

export interface StreamParser {
  sessionId?: string;
  handle(event: any): AgentEvent[];
}

export function stringifyToolOutput(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c: any) => (c?.type === 'text' ? c.text : c?.type ? `[${c.type}]` : '')).join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}

/** `claude -p --output-format stream-json --verbose --include-partial-messages` */
export class ClaudeStreamParser implements StreamParser {
  sessionId?: string;
  private sawDelta = false;

  handle(e: any): AgentEvent[] {
    const out: AgentEvent[] = [];
    if (e.session_id && e.session_id !== this.sessionId) {
      this.sessionId = e.session_id;
      out.push({ kind: 'session', sessionId: e.session_id });
    }

    switch (e.type) {
      case 'stream_event': {
        const ev = e.event;
        if (e.parent_tool_use_id || ev?.type !== 'content_block_delta') break;
        if (ev.delta?.type === 'text_delta' && ev.delta.text) {
          this.sawDelta = true;
          out.push({ kind: 'text', text: ev.delta.text });
        } else if (ev.delta?.type === 'thinking_delta' && ev.delta.thinking) {
          this.sawDelta = true;
          out.push({ kind: 'thinking', text: ev.delta.thinking });
        }
        break;
      }
      case 'assistant': {
        if (e.parent_tool_use_id) break; // subagent chatter
        // CLI-generated error stand-ins; the `result` event carries the error
        if (e.message?.model === '<synthetic>') break;
        for (const block of e.message?.content ?? []) {
          if (block.type === 'tool_use') {
            out.push({ kind: 'tool_start', id: block.id, name: block.name, input: block.input });
          } else if (!this.sawDelta && block.type === 'text' && block.text) {
            out.push({ kind: 'text', text: block.text });
          } else if (!this.sawDelta && block.type === 'thinking' && block.thinking) {
            out.push({ kind: 'thinking', text: block.thinking });
          }
        }
        break;
      }
      case 'user': {
        if (e.parent_tool_use_id) break;
        const content = e.message?.content;
        if (!Array.isArray(content)) break;
        for (const block of content) {
          if (block.type === 'tool_result') {
            out.push({
              kind: 'tool_end',
              id: block.tool_use_id,
              output: stringifyToolOutput(block.content),
              isError: !!block.is_error,
            });
          }
        }
        break;
      }
      case 'result':
        out.push({
          kind: 'done',
          sessionId: e.session_id,
          isError: !!e.is_error,
          error: e.is_error ? String(e.result ?? 'Claude Code reported an error') : undefined,
          costUsd: e.total_cost_usd,
        });
        break;
    }
    return out;
  }
}

/** `codex exec --json` */
export class CodexStreamParser implements StreamParser {
  sessionId?: string;
  private started = new Set<string>();

  private toolName(item: any): string {
    switch (item.type) {
      case 'command_execution': return 'shell';
      case 'file_change': return 'edit_files';
      case 'mcp_tool_call': return `${item.server}.${item.tool}`;
      default: return item.type;
    }
  }

  private toolInput(item: any): Record<string, unknown> {
    switch (item.type) {
      case 'command_execution': return { command: item.command };
      case 'file_change': return { changes: item.changes };
      case 'mcp_tool_call': return item.arguments ?? {};
      case 'web_search': return { query: item.query };
      case 'todo_list': return { items: item.items };
      default: return {};
    }
  }

  private toolOutput(item: any): { output: string; isError: boolean } {
    switch (item.type) {
      case 'command_execution':
        return { output: item.aggregated_output ?? '', isError: item.exit_code != null && item.exit_code !== 0 };
      case 'file_change':
        return {
          output: (item.changes ?? []).map((c: any) => `${c.kind} ${c.path}`).join('\n'),
          isError: item.status === 'failed',
        };
      case 'mcp_tool_call':
        return {
          output: item.error?.message ?? stringifyToolOutput(item.result?.content ?? item.result),
          isError: !!item.error || item.status === 'failed',
        };
      default:
        return { output: '', isError: item.status === 'failed' };
    }
  }

  handle(e: any): AgentEvent[] {
    const out: AgentEvent[] = [];
    switch (e.type) {
      case 'thread.started':
        this.sessionId = e.thread_id;
        out.push({ kind: 'session', sessionId: e.thread_id });
        break;
      case 'item.started':
      case 'item.updated':
      case 'item.completed': {
        const item = e.item;
        const completed = e.type === 'item.completed';
        if (!item) break;
        if (item.type === 'agent_message') {
          if (completed && item.text) out.push({ kind: 'text', text: item.text + '\n\n' });
        } else if (item.type === 'reasoning') {
          if (completed && item.text) out.push({ kind: 'thinking', text: item.text + '\n' });
        } else if (item.type === 'error') {
          out.push({ kind: 'text', text: `\n⚠️ ${item.message}\n` });
        } else {
          if (!this.started.has(item.id)) {
            this.started.add(item.id);
            out.push({ kind: 'tool_start', id: item.id, name: this.toolName(item), input: this.toolInput(item) });
          }
          if (completed) out.push({ kind: 'tool_end', id: item.id, ...this.toolOutput(item) });
        }
        break;
      }
      case 'turn.failed':
        out.push({ kind: 'done', sessionId: this.sessionId, isError: true, error: e.error?.message ?? 'Codex turn failed' });
        break;
      case 'error':
        out.push({ kind: 'done', sessionId: this.sessionId, isError: true, error: e.message ?? 'Codex error' });
        break;
      case 'turn.completed':
        out.push({ kind: 'done', sessionId: this.sessionId });
        break;
    }
    return out;
  }
}
