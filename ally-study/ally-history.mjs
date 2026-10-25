import fs from 'node:fs';
import path from 'node:path';

export class ConversationHistory {
  constructor(file, now = () => Date.now()) {
    this.file = file;
    this.now = now;
    this.messages = [];
    if (fs.existsSync(file)) {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.messages) || saved.messages.some(m =>
        !Number.isSafeInteger(m.id) || !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' || !Number.isFinite(Date.parse(m.created_at)))) {
        throw Error('Local conversation history is invalid; the existing file was preserved.');
      }
      this.messages = saved.messages;
    }
    this.nextId = this.messages.reduce((next, m) => Math.max(next, m.id + 1), this.now() * 1000);
  }
  appendTurn(user, assistant, startedAt = new Date(this.now()).toISOString()) {
    const messages = [...this.messages];
    let nextId = this.nextId;
    if (String(user).trim()) messages.push({id: nextId++, role: 'user', content: String(user), created_at: startedAt, source: 'voice'});
    messages.push({id: nextId++, role: 'assistant', content: String(assistant), created_at: new Date(this.now()).toISOString(), source: 'voice'});
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const staged = this.file + '.staged';
    fs.writeFileSync(staged, JSON.stringify({version: 1, messages}), {mode: 0o600});
    fs.renameSync(staged, this.file);
    this.messages = messages;
    this.nextId = nextId;
  }
  page(limit = 40, beforeId) {
    const count = Number(limit);
    const before = beforeId == null ? undefined : Number(beforeId);
    if (!Number.isSafeInteger(count) || count < 1 || count > 200 ||
      (before !== undefined && (!Number.isSafeInteger(before) || before < 0))) {
      throw Error('Invalid history pagination.');
    }
    const eligible = before === undefined ? this.messages : this.messages.filter(m => m.id < before);
    return {messages: eligible.slice(-count), has_more: eligible.length > count};
  }
}

// Parse literal speech cues without executing the generated drawing program.
export function speechFromDrawing(program, parse) {
  const code = String(program).replace(/^\s*```(?:javascript|js)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  let tree;
  try { tree = parse(code, {ecmaVersion: 'latest'}); } catch { return String(program); }
  const speech = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'say') {
      const arg = node.arguments[0];
      if (arg?.type === 'Literal' && typeof arg.value === 'string') speech.push(arg.value);
      else if (arg?.type === 'TemplateLiteral' && arg.expressions.length === 0) speech.push(arg.quasis.map(q => q.value.cooked ?? q.value.raw).join(''));
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  return speech.join('\n\n') || String(program);
}
