// Turn each CLI's JSONL output into the shared AgentEvent stream.
import type { AgentEvent } from './types.js';

export interface StreamParser {
  sessionId?: string;
  handle(event: any): AgentEvent[];
}

export function stringifyToolOutput(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c: any) => (['text', 'input_text', 'output_text'].includes(c?.type) ? c.text : c?.type ? `[${c.type}]` : '')).join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}

/**
 * Image blocks in a tool result or message as data URLs. Handles Anthropic
 * (`source.data`), MCP (`data` + `mimeType`) and OpenAI (`image_url`) shapes.
 */
export function extractImages(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const c of content as any[]) {
    if (c?.type === 'image' && c.source?.type === 'base64' && c.source.data) {
      out.push(`data:${c.source.media_type ?? 'image/png'};base64,${c.source.data}`);
    } else if (c?.type === 'image' && typeof c.data === 'string') {
      out.push(`data:${c.mimeType ?? 'image/png'};base64,${c.data}`);
    } else if (c?.type === 'input_image' || c?.type === 'image_url') {
      const url = typeof c.image_url === 'string' ? c.image_url : c.image_url?.url;
      if (typeof url === 'string' && url.startsWith('data:')) out.push(url);
    } else if (c?.type === 'tool_result') {
      out.push(...extractImages(c.content));
    }
  }
  return out;
}

/**
 * Readable text for a failed `result` event. Execution errors carry `errors[]`
 * instead of `result`; a stale CLI login (401) gets the one fix that works.
 */
export function claudeError(e: any): string {
  const detail = [e.result, ...(Array.isArray(e.errors) ? e.errors : [])]
    .map(x => (typeof x === 'string' ? x : x?.message ?? ''))
    .filter(Boolean)
    .join('\n')
    .trim();
  if (e.api_error_status === 401 || /authenticat|oauth|401/i.test(detail)) {
    return 'Claude Code is not logged in (its saved login expired). Run `claude` in a terminal and use /login, then try again.';
  }
  if (detail) return detail;
  return e.subtype && e.subtype !== 'success' ? `Claude Code stopped: ${e.subtype.replace(/_/g, ' ')}` : 'Claude Code reported an error';
}

/** `claude -p --output-format stream-json --verbose --include-partial-messages` */
export class ClaudeStreamParser implements StreamParser {
  sessionId?: string;
  private streamedBlocks = new Set<number>();
  private streamedKinds = new Set<string>();

  handle(e: any): AgentEvent[] {
    const out: AgentEvent[] = [];
    if (e.session_id && e.session_id !== this.sessionId) {
      this.sessionId = e.session_id;
      out.push({ kind: 'session', sessionId: e.session_id });
    }

    switch (e.type) {
      case 'stream_event': {
        const ev = e.event;
        if (e.parent_tool_use_id) break;
        if (ev?.type === 'message_start') {
          this.streamedBlocks.clear();
          this.streamedKinds.clear();
        }
        if (ev?.type !== 'content_block_delta') break;
        if (ev.delta?.type === 'text_delta' && ev.delta.text) {
          if (typeof ev.index === 'number') this.streamedBlocks.add(ev.index);
          else this.streamedKinds.add('text');
          out.push({ kind: 'text', text: ev.delta.text });
        } else if (ev.delta?.type === 'thinking_delta' && ev.delta.thinking) {
          if (typeof ev.index === 'number') this.streamedBlocks.add(ev.index);
          else this.streamedKinds.add('thinking');
          out.push({ kind: 'thinking', text: ev.delta.thinking });
        }
        break;
      }
      case 'assistant': {
        if (e.parent_tool_use_id) break; // subagent chatter
        // CLI-generated error stand-ins; the `result` event carries the error
        if (e.message?.model === '<synthetic>') break;
        for (const [index, block] of (e.message?.content ?? []).entries()) {
          const streamed = this.streamedBlocks.has(index) || this.streamedKinds.has(block.type);
          if (block.type === 'tool_use') {
            out.push({ kind: 'tool_start', id: block.id, name: block.name, input: block.input });
          } else if (!streamed && block.type === 'text' && block.text) {
            out.push({ kind: 'text', text: block.text });
          } else if (!streamed && block.type === 'thinking' && block.thinking) {
            out.push({ kind: 'thinking', text: block.thinking });
          }
        }
        this.streamedBlocks.clear();
        this.streamedKinds.clear();
        break;
      }
      case 'user': {
        if (e.parent_tool_use_id) break;
        const content = e.message?.content;
        if (!Array.isArray(content)) break;
        for (const block of content) {
          if (block.type === 'tool_result') {
            const images = extractImages(block.content);
            out.push({
              kind: 'tool_end',
              id: block.tool_use_id,
              output: stringifyToolOutput(block.content),
              isError: !!block.is_error,
              ...(images.length ? { images } : {}),
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
          error: e.is_error ? claudeError(e) : undefined,
          costUsd: e.total_cost_usd,
          usage: {
            inputTokens: e.usage ? (e.usage.input_tokens ?? 0) + (e.usage.cache_read_input_tokens ?? 0) + (e.usage.cache_creation_input_tokens ?? 0) : undefined,
            outputTokens: e.usage?.output_tokens,
            cachedTokens: e.usage?.cache_read_input_tokens,
            costUsd: e.total_cost_usd,
            durationMs: e.duration_ms,
          },
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

  private toolOutput(item: any): { output: string; isError: boolean; images?: string[] } {
    switch (item.type) {
      case 'command_execution':
        return { output: item.aggregated_output ?? '', isError: item.exit_code != null && item.exit_code !== 0 };
      case 'file_change':
        return {
          output: (item.changes ?? []).map((c: any) => `${c.kind} ${c.path}`).join('\n'),
          isError: item.status === 'failed',
        };
      case 'mcp_tool_call': {
        const images = extractImages(item.result?.content);
        return {
          output: item.error?.message ?? stringifyToolOutput(item.result?.content ?? item.result),
          isError: !!item.error || item.status === 'failed',
          ...(images.length ? { images } : {}),
        };
      }
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
          } else if (item.type === 'todo_list') {
            // Plan progress: the same item updates as steps get checked off
            out.push({ kind: 'tool_update', id: item.id, input: this.toolInput(item) });
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
        out.push({
          kind: 'done',
          sessionId: this.sessionId,
          usage: e.usage && {
            inputTokens: e.usage.input_tokens,
            outputTokens: e.usage.output_tokens,
            cachedTokens: e.usage.cached_input_tokens,
          },
        });
        break;
    }
    return out;
  }
}
