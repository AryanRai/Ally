/** Only public assistant prose from the current turn; never reasoning/tool data. */
export function activityPreview(records: any[], provider: 'codex' | 'claude'): string {
  let text = '';
  for (const record of records) {
    const p = record?.payload;
    if (provider === 'codex' && record.type === 'event_msg' && p?.type === 'task_started') text = '';
    if (provider === 'claude' && record.type === 'user' && !record.isMeta && !record.isSidechain && typeof record.message?.content === 'string') text = '';
    const message = provider === 'claude' && record.type === 'assistant' && !record.isSidechain ? record.message
      : provider === 'codex' && record.type === 'response_item' && p?.type === 'message' && p.role === 'assistant' && p.channel !== 'analysis' ? p : undefined;
    if (message) {
      const content = message.content;
      const prose = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((part: any) => ['text', 'output_text'].includes(part.type)).map((part: any) => part.text || '').join('\n') : '';
      if (prose.trim()) text = prose;
    }
  }
  return text.replace(/```[\s\S]*?(?:```|$)/g, '').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim().slice(-1200);
}
