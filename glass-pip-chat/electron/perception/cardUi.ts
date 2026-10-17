// Generative UI for assist cards: the agent may attach a small structured view
// as a fenced `ally-ui` JSON block. Only these components exist, everything is
// validated and size-capped here, and nothing is ever rendered as HTML.

export type CardBlock =
  | { kind: 'facts'; items: Array<{ label: string; value: string }> }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'callout'; tone: 'info' | 'warning' | 'decision'; text: string }
  | { kind: 'code'; language?: string; code: string }
  | { kind: 'progress'; label: string; value: number }
  /** Buttons that ask the agent a follow-up (never run anything directly) */
  | { kind: 'actions'; items: Array<{ label: string; ask: string }> };

const LIMITS = { blocks: 6, items: 12, columns: 6, rows: 15, text: 400, code: 2000, label: 60 };

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function block(b: any): CardBlock | null {
  if (!b || typeof b !== 'object') return null;
  switch (b.kind) {
    case 'facts': {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, LIMITS.items)
        .map((i: any) => ({ label: str(i?.label, LIMITS.label), value: str(i?.value, LIMITS.text) }))
        .filter((i: any): i is { label: string; value: string } => !!i.label && !!i.value);
      return items.length ? { kind: 'facts', items } : null;
    }
    case 'list': {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, LIMITS.items).map((i: unknown) => str(i, LIMITS.text)).filter(Boolean) as string[];
      return items.length ? { kind: 'list', items, ordered: b.ordered === true } : null;
    }
    case 'table': {
      const columns = (Array.isArray(b.columns) ? b.columns : []).slice(0, LIMITS.columns).map((c: unknown) => str(c, LIMITS.label) ?? '');
      if (!columns.length) return null;
      const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, LIMITS.rows)
        .filter(Array.isArray)
        .map((r: unknown[]) => columns.map((_: string, i: number) => str(r[i], LIMITS.text) ?? ''));
      return rows.length ? { kind: 'table', columns, rows } : null;
    }
    case 'callout': {
      const text = str(b.text, LIMITS.text);
      const tone = b.tone === 'warning' || b.tone === 'decision' ? b.tone : 'info';
      return text ? { kind: 'callout', tone, text } : null;
    }
    case 'code': {
      const code = typeof b.code === 'string' && b.code.trim() ? b.code.slice(0, LIMITS.code) : null;
      return code ? { kind: 'code', code, language: str(b.language, 20) ?? undefined } : null;
    }
    case 'progress': {
      const label = str(b.label, LIMITS.label);
      const value = Number(b.value);
      return label && Number.isFinite(value) ? { kind: 'progress', label, value: Math.max(0, Math.min(1, value)) } : null;
    }
    case 'actions': {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 4)
        .map((i: any) => ({ label: str(i?.label, 40), ask: str(i?.ask, LIMITS.text) }))
        .filter((i: any): i is { label: string; ask: string } => !!i.label && !!i.ask);
      return items.length ? { kind: 'actions', items } : null;
    }
    default:
      return null;
  }
}

/** Validate untrusted JSON into card blocks; anything unknown or malformed is dropped. */
export function validateCardUi(value: unknown): CardBlock[] {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  return list.slice(0, LIMITS.blocks).map(block).filter((b): b is CardBlock => !!b);
}

const FENCE = /```ally-ui\s*\n([\s\S]*?)```/i;

/** Pull the `ally-ui` block out of a reply: the text without it, plus parsed blocks. */
export function extractCardUi(reply: string): { text: string; ui: CardBlock[] } {
  const m = FENCE.exec(reply);
  if (!m) return { text: reply, ui: [] };
  let ui: CardBlock[] = [];
  try { ui = validateCardUi(JSON.parse(m[1])); } catch { /* malformed: show text only */ }
  return { text: reply.replace(m[0], '').trim(), ui };
}

/** What the agent is told it may use. */
export const CARD_UI_GUIDE = [
  'Optionally, after the text, add ONE fenced block for a small structured view when it genuinely helps (comparison, key facts, steps, follow-ups):',
  '```ally-ui',
  '[{"kind":"facts","items":[{"label":"…","value":"…"}]},',
  ' {"kind":"table","columns":["…","…"],"rows":[["…","…"]]},',
  ' {"kind":"list","ordered":true,"items":["…"]},',
  ' {"kind":"callout","tone":"info|warning|decision","text":"…"},',
  ' {"kind":"code","language":"ts","code":"…"},',
  ' {"kind":"progress","label":"…","value":0.6},',
  ' {"kind":"actions","items":[{"label":"Short button","ask":"Follow-up question the user can send"}]}]',
  '```',
  'Keep it tiny (at most 3 blocks). Skip it when plain text is enough.',
].join('\n');
