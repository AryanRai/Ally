/** Decode only complete characters from a potentially unfinished JSON string. */
function stringPrefix(raw: string): string {
  let text = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') break;
    if (c !== '\\') { text += c; continue; }
    const escape = raw[++i];
    if (!escape) break;
    if (escape === 'u') {
      const hex = raw.slice(i + 1, i + 5);
      if (!/^[\da-f]{4}$/i.test(hex)) break;
      text += String.fromCharCode(parseInt(hex, 16)); i += 4;
    } else {
      const decoded: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
      if (!(escape in decoded)) break;
      text += decoded[escape];
    }
  }
  return text.replace(/[\uD800-\uDBFF]$/, '');
}

/** A bounded, data-only partial JSON reader. Unfinished strings retain complete characters. */
class PartialReply {
  position = 0;
  private nodes = 0;
  constructor(private raw: string) {}
  private space() { while (/\s/.test(this.raw[this.position] ?? '') && this.position < this.raw.length) this.position++; }
  private string() {
    const start = ++this.position;
    while (this.position < this.raw.length) {
      const c = this.raw[this.position++];
      if (c === '"') return { value: stringPrefix(this.raw.slice(start, this.position)), complete: true };
      if (c === '\\') this.position++;
    }
    return { value: stringPrefix(this.raw.slice(start)), complete: false };
  }
  read(depth = 0): unknown {
    this.space();
    if (depth > 16 || ++this.nodes > 4096) { this.position = this.raw.length; return undefined; }
    const c = this.raw[this.position];
    if (c === '"') return this.string().value;
    if (c === '{') {
      this.position++;
      const object: Record<string, unknown> = Object.create(null);
      while (this.position < this.raw.length) {
        this.space();
        if (this.raw[this.position] === '}') { this.position++; break; }
        if (this.raw[this.position] !== '"') break;
        const key = this.string(); this.space();
        if (!key.complete || this.raw[this.position++] !== ':') break;
        object[key.value] = this.read(depth + 1); this.space();
        if (this.raw[this.position] !== ',') { if (this.raw[this.position] === '}') this.position++; break; }
        this.position++;
      }
      return object;
    }
    if (c === '[') {
      this.position++;
      const values: unknown[] = [];
      while (this.position < this.raw.length) {
        this.space();
        if (this.raw[this.position] === ']') { this.position++; break; }
        values.push(this.read(depth + 1)); this.space();
        if (this.raw[this.position] !== ',') { if (this.raw[this.position] === ']') this.position++; break; }
        this.position++;
      }
      return values;
    }
    const start = this.position;
    while (this.position < this.raw.length && !/[\s,}\]]/.test(this.raw[this.position])) this.position++;
    try { return JSON.parse(this.raw.slice(start, this.position)); } catch { return undefined; }
  }
}
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const textValue = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';

/** Readable commentary and partial reply/card content, with no interactive partial widgets. */
export function liveReplyText(raw: string): string {
  raw = raw.slice(0, 64001);
  const start = /\{\s*(?:"|$)/.exec(raw);
  if (!start) return raw.replace(/`{1,3}(?:j(?:s(?:o(?:n)?)?)?)?\s*$/, '').trim().slice(0, 12000);
  const commentary = raw.slice(0, start.index).replace(/```(?:json)?\s*$/, '').trim();
  let cursor = start.index;
  let reply: Record<string, unknown> | undefined;
  while (cursor < raw.length) {
    const reader = new PartialReply(raw.slice(cursor));
    const candidate = object(reader.read());
    if (candidate && ('text' in candidate || 'components' in candidate)) reply = candidate;
    const next = /\{\s*(?:"|$)/.exec(raw.slice(cursor + Math.max(1, reader.position)));
    if (!next) break;
    cursor += Math.max(1, reader.position) + next.index;
  }
  const parts = [commentary, textValue(reply?.text, 12000)];
  for (const value of (Array.isArray(reply?.components) ? reply.components : []).slice(0, 6)) {
    const card = object(value);
    if (!card || !['card', 'checklist', 'timer', 'actions', 'progress'].includes(String(card.type))) continue;
    parts.push(textValue(card.title, 80), textValue(card.body, 1200));
    if (card.type === 'checklist' && Array.isArray(card.items)) parts.push(...card.items.slice(0, 8).map(item => textValue(item, 180)));
    if (card.type === 'actions' && Array.isArray(card.actions)) parts.push(...card.actions.slice(0, 3).map(action => textValue(object(action)?.label, 40)));
  }
  return parts.filter(Boolean).join('\n\n').slice(0, 12000);
}
