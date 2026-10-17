export interface WatchReply { text: string; components: Record<string, unknown>[] }
const short = (s: unknown, max: number) => typeof s === 'string' ? s.slice(0, max) : '';

/** CLI text can include commentary before the final structured answer. */
function lastReplyObject(raw: string): unknown {
  let start = -1, depth = 0, quoted = false, escaped = false;
  let reply: unknown;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (start < 0) {
      if (char === '{') { start = i; depth = 1; }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        const candidate = JSON.parse(raw.slice(start, i + 1));
        if (typeof candidate?.text === 'string') reply = candidate;
      } catch { /* Plain commentary can contain braces. */ }
      start = -1;
    }
  }
  return reply;
}

/** Never execute agent-authored UI. Only this small data catalog crosses the bridge. */
export function parseWatchReply(raw: string): WatchReply {
  const plain = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  let value: any;
  try { value = JSON.parse(plain); } catch { value = lastReplyObject(plain); }
  if (!value || typeof value !== 'object' || typeof value.text !== 'string') return { text: raw.slice(0, 12000), components: [] };
  const components: Record<string, unknown>[] = [];
  for (const c of (Array.isArray(value.components) ? value.components : []).slice(0, 6)) {
    if (!c || !['card', 'checklist', 'timer', 'actions', 'progress'].includes(c.type)) continue;
    const card: Record<string, unknown> = { type: c.type, title: short(c.title, 80), body: short(c.body, 1200) };
    if (c.type === 'checklist') card.items = (Array.isArray(c.items) ? c.items : []).slice(0, 8).filter((s: unknown) => typeof s === 'string').map((s: string) => s.slice(0, 180));
    if (c.type === 'timer') card.seconds = Math.max(1, Math.min(86400, Math.round(Number(c.seconds) || 60)));
    if (c.type === 'progress') card.progress = Math.max(0, Math.min(1, Number(c.progress) || 0));
    if (c.type === 'actions') card.actions = (Array.isArray(c.actions) ? c.actions : []).slice(0, 3).filter((a: any) => a && typeof a.label === 'string' && typeof a.prompt === 'string').map((a: any) => ({ label: a.label.slice(0, 40), prompt: a.prompt.slice(0, 2000) }));
    components.push(card);
  }
  return { text: value.text.slice(0, 12000), components };
}

export const WATCH_INSTRUCTIONS = `You are Ally on a round smartwatch. Keep answers concise and glanceable. Your final answer must be one JSON object, without markdown fences: {"text":"your answer","components":[]}. If you give progress commentary before tools, use plain text; reserve the JSON object for the final answer.
You may add up to 6 optional components from this catalog:
{"type":"card","title":"...","body":"..."}
{"type":"checklist","title":"...","items":["..."]}
{"type":"timer","title":"...","seconds":300}
{"type":"actions","title":"...","actions":[{"label":"...","prompt":"follow-up message"}]}
{"type":"progress","title":"...","body":"...","progress":0.5}
Only use a widget when useful. A timer starts only after the user taps Start; it alerts only while its card is open. Actions send a follow-up prompt only when tapped. Checklists are local. Never claim a reminder, notification, or external action was scheduled unless a real tool actually did it. Do not invent live data. The user is viewing this conversation on a watch. Continue its existing context.`;
