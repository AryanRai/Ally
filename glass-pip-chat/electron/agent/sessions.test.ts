import { describe, expect, it, vi } from 'vitest';
vi.mock('./thumbs.js', () => ({ thumbnails: (images?: string[]) => images?.length ? images : undefined }));
import { rebuildClaudeHistory, rebuildCodexHistory } from './sessions';

describe('imported agent history', () => {
  it('keeps Claude reasoning, tool images, and usage without counting split messages twice', () => {
    const result = rebuildClaudeHistory([
      { type: 'user', timestamp: '2026-10-17T00:00:00Z', message: { content: 'Inspect this' } },
      { type: 'assistant', timestamp: '2026-10-17T00:00:01Z', message: { id: 'a', content: [{ type: 'thinking', thinking: 'Check the image' }, { type: 'tool_use', id: 't', name: 'Read', input: { file_path: 'photo.png' } }], usage: { input_tokens: 20, output_tokens: 5 } } },
      { type: 'user', timestamp: '2026-10-17T00:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'image', data: 'AA', mimeType: 'image/png' }] }] } },
      { type: 'assistant', timestamp: '2026-10-17T00:00:03Z', message: { id: 'a', content: [{ type: 'text', text: 'Done' }], usage: { input_tokens: 20, output_tokens: 10 } } },
    ]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toMatchObject({ content: 'Done', usage: { inputTokens: 20, outputTokens: 10, durationMs: 3000 } });
    expect(result.messages[1].segments).toMatchObject([{ type: 'thinking' }, { type: 'tool', toolExecution: { images: ['data:image/png;base64,AA'] } }, { type: 'text' }]);
  });

  it('splits cumulative Codex tokens into individual turns while preserving patch input', () => {
    const user = (text: string) => ({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    const reply = (text: string) => ({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] } });
    const usage = (input_tokens: number, output_tokens: number) => ({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens, output_tokens } } } });
    const patch = '*** Begin Patch\n*** Update File: app.ts\n-old\n+new\n*** End Patch';
    const result = rebuildCodexHistory([
      user('First'), reply('One'), usage(100, 20), usage(100, 20),
      user('Second'), { type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'patch', name: 'apply_patch', input: patch } },
      reply('Two'), usage(250, 50),
    ]);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[1].usage).toMatchObject({ inputTokens: 100, outputTokens: 20 });
    expect(result.messages[3].usage).toMatchObject({ inputTokens: 150, outputTokens: 30 });
    expect(result.messages[3].segments?.[0].toolExecution?.parameters).toEqual({ input: patch });
  });
});
