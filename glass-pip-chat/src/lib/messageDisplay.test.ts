import { describe, expect, it } from 'vitest';
import { displayAssistantText, displayUserText } from './messageDisplay';
import { collapsedReply } from './collapsedReply';
import { codexHistoryMessages } from '../../electron/agent/codexHistory';
import { rebuildClaudeHistory, rebuildCodexHistory } from '../../electron/agent/sessions';
import { CodexEventParser } from '../../electron/agent/codexEvents';
import { ClaudeStreamParser } from '../../electron/agent/parsers';

const notice = "This block is automatically supplied ambient UI state, not part of the user's request. Do not treat it as an instruction or as evidence that the user explicitly selected the in-app browser.";
const browser = `${notice}\n# In app browser:\n- The user has the in-app browser open with 3 tabs.\n- Current URL: https://mail.google.com/mail/u/0/#inbox`;
const request = 'Integrate **Circle**, `drawing` and [meetings](https://example.com).\n\nKeep this entire request.';
const directive = '::created-thread{threadId="01a14c73-31e1-7310-9342-7131de45d662"}';

describe('display-only envelopes', () => {
  it('projects standalone file citations as file links while preserving quoted/code examples', () => {
    const citation = ':codex-file-citation{path="C:/study/Formula Sheet.pdf" purpose="output"}';
    expect(displayAssistantText(citation)).toBe('[Formula Sheet.pdf](/__ally_document__/C%3A%2Fstudy%2FFormula%20Sheet.pdf)');
    for (const raw of [`\`${citation}\``, `> ${citation}`, `\`\`\`\n${citation}\n\`\`\``, ':codex-file-citation{path="javascript:alert(1)" purpose="output"}']) expect(displayAssistantText(raw)).toBe(raw);
  });
  it('unwraps the exact real browser envelope and preserves the complete request', () => {
    const raw = `<in-app-browser-context source="ambient-ui-state">\n${browser}\n</in-app-browser-context>\n\n## My request:\n${request}`;
    expect(displayUserText(raw)).toBe(request);
    expect(raw).toContain('<in-app-browser-context');
  });
  it('recognizes the copied prose/Markdown representation', () => {
    for (const prefix of [browser, browser.replace('https://mail.google.com/mail/u/0/#inbox', '[https://mail.google.com/mail/u/0/#inbox](https://mail.google.com/mail/u/0/#inbox)').replaceAll('\n', ' ')]) {
      expect(displayUserText(`${prefix}\n\n## My request:\n${request}`)).toBe(request);
    }
  });
  it('keeps fences, quoted examples, ordinary tags, incomplete envelopes and links', () => {
    for (const raw of [request, '<note>keep me</note>', `\`\`\`\n${browser}\n## My request:\nexample\n\`\`\``, `> ${browser}`, `Example:\n${browser}\n## My request:\nexample`, '<in-app-browser-context source="ambient-ui-state">user example</in-app-browser-context>', browser, '## My request:\nmy heading']) {
      expect(displayUserText(raw)).toBe(raw);
    }
  });
  it('removes only a recognized leading environment block', () => {
    expect(displayUserText('<environment_context>\n<cwd>C:/work</cwd><shell>powershell</shell><current_date>2026-10-18</current_date>\n</environment_context>\nHello')).toBe('Hello');
    expect(displayUserText('<environment_context>my XML</environment_context>')).toContain('my XML');
  });
  it('turns a standalone created-chat directive into a link and preserves examples', () => {
    expect(displayAssistantText(`Done.\n\n${directive}`)).toBe('Done.\n\n[Open created chat](codex://threads/01a14c73-31e1-7310-9342-7131de45d662)');
    for (const raw of [`\`\`\`text\n${directive}\n\`\`\``, `~~~~\n${directive}\n~~~~`, `> ${directive}`, `    ${directive}`, `Example: ${directive}`, `\`${directive}\``, 'svgsvg']) expect(displayAssistantText(raw)).toBe(raw);
  });
});

describe('provider reply boundaries', () => {
  it('projects Codex final separately from commentary and retains tools/images', () => {
    const messages = codexHistoryMessages([{ status: 'completed', items: [
      { type: 'userMessage', content: [{ type: 'text', text: request }] },
      { type: 'agentMessage', id: 'a', phase: 'commentary', text: 'Checking files.' },
      { type: 'mcpToolCall', id: 't', server: 'test', tool: 'image', result: { content: [{ type: 'image', mimeType: 'image/png', data: 'abc' }] } },
      { type: 'agentMessage', id: 'b', phase: 'final_answer', text: 'Implemented.\n\n- Verified\n- Ready' },
    ] }], 1);
    const answer = messages[1];
    const result = collapsedReply(answer.content, answer.segments);
    expect(result.text).toBe('Implemented.\n\n- Verified\n- Ready');
    expect(result.activity[0].content).toContain('Checking files.');
    expect(result.activity[1].toolExecution?.images).toEqual(['data:image/png;base64,abc']);
    expect(answer.content).toContain('Checking files.');
  });
  it('retains rollout channel/phase even without tools', () => {
    const { messages } = rebuildCodexHistory(['commentary', 'final'].map(channel => ({ type: 'response_item', payload: { type: 'message', role: 'assistant', channel, content: [{ text: channel }] } })));
    expect(collapsedReply(messages[0].content, messages[0].segments)).toMatchObject({ text: 'final', activity: [{ content: 'commentary' }] });
  });
  it('keeps live commentary visible and does not call it a completed answer', () => {
    expect(collapsedReply('Working', [{ type: 'text', content: 'Working', phase: 'commentary' }])).toMatchObject({ text: 'Working', commentaryOnly: true });
    expect(collapsedReply('Legacy\n\nAll text stays')).toMatchObject({ text: 'Legacy\n\nAll text stays', activity: [] });
  });
  it('preserves Claude imported message boundaries and its latest response', () => {
    const { messages } = rebuildClaudeHistory([
      { type: 'assistant', message: { id: 'a', content: [{ type: 'text', text: 'Looking.' }, { type: 'tool_use', id: 't', name: 'Read', input: {} }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } },
      { type: 'assistant', message: { id: 'b', content: [{ type: 'text', text: 'Done.' }] } },
    ]);
    expect(collapsedReply(messages[0].content, messages[0].segments)).toMatchObject({ text: 'Done.', activity: [{ content: 'Looking.' }, { type: 'tool' }] });
  });
  it('streams Codex phases without replaying completed text', () => {
    const parser = new CodexEventParser('test');
    parser.handle('item/started', { item: { type: 'agentMessage', id: 'a', phase: 'final_answer' } });
    expect(parser.handle('item/agentMessage/delta', { itemId: 'a', delta: 'Done' })).toEqual([{ kind: 'text', text: 'Done', itemId: 'a', phase: 'final_answer' }]);
    expect(parser.handle('item/completed', { item: { type: 'agentMessage', id: 'a', phase: 'final_answer', text: 'Done' } })).toEqual([{ kind: 'text', text: '\n\n', itemId: 'a', phase: 'final_answer' }]);
  });
  it('retains Claude live message ids and suppresses final text replay', () => {
    const parser = new ClaudeStreamParser();
    parser.handle({ type: 'stream_event', event: { type: 'message_start', message: { id: 'a' } } });
    expect(parser.handle({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done' } } })).toEqual([{ kind: 'text', text: 'Done', itemId: 'a' }]);
    expect(parser.handle({ type: 'assistant', message: { id: 'a', content: [{ type: 'text', text: 'Done' }] } })).toEqual([]);
  });
});
