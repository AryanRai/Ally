import { randomUUID } from 'node:crypto';
import type { AgentPermission } from '../agent/types.js';
import type { DeviceAttachment } from './media.js';

export interface ApprovalField { id: string; label: string; secret: boolean; required: boolean; options: Array<{ value: string; label: string }>; freeText: boolean }
export interface WatchApproval { id: string; title: string; detail: string; fields: ApprovalField[]; actions: Array<{ value: string; label: string }>; expiresAt: number; attachments?: DeviceAttachment[] }
export interface ApprovalAnswer { action: string; values?: Record<string, string> }
interface Spec { title: string; detail: string; fields: ApprovalField[]; actions: WatchApproval['actions']; answer: (answer: ApprovalAnswer) => unknown; cancel: unknown }
const cancelAction = { value: 'cancel', label: 'Cancel' };
const choices = [{ value: 'accept', label: 'Allow once' }, { value: 'decline', label: 'Deny' }, cancelAction];
const formCancel = { action: 'cancel', content: null, _meta: null };

export function watchPermission(value: unknown): AgentPermission {
  if (value == null) return 'readonly';
  if (value === 'readonly' || value === 'edit' || value === 'full') return value;
  throw new Error('Invalid chat permission');
}

export function approvalSpec(method: string, p: any): Spec {
  const detail = [p.reason, p.command, p.cwd, p.networkApprovalContext && JSON.stringify(p.networkApprovalContext),
    p.additionalPermissions && JSON.stringify(p.additionalPermissions)].filter(Boolean).join('\n\n');
  if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
    const text = method.includes('fileChange') ? [p.reason, p.grantRoot, p.item && JSON.stringify(p.item)].filter(Boolean).join('\n\n') : detail;
    // Never offer session-wide approvals or silently create policy amendments.
    const actions = choices.filter(c => !p.availableDecisions || p.availableDecisions.includes(c.value));
    return { title: method.includes('fileChange') ? 'Allow file changes?' : 'Allow this action?', detail: text, fields: [], actions, cancel: { decision: 'cancel' }, answer: a => ({ decision: a.action }) };
  }
  if (method === 'item/permissions/requestApproval') {
    return { title: 'Grant permissions for this turn?', detail: [p.reason, p.cwd, JSON.stringify(p.permissions)].filter(Boolean).join('\n\n'), fields: [], actions: choices,
      cancel: { permissions: {}, scope: 'turn' }, answer: a => ({ permissions: a.action === 'accept' ? p.permissions : {}, scope: 'turn' }) };
  }
  if (method === 'item/tool/requestUserInput' || method === 'tool/requestUserInput') {
    if (!Array.isArray(p.questions) || p.questions.length > 6) throw new Error('Unsupported question format');
    const fields: ApprovalField[] = p.questions.map((q: any) => ({ id: q.id, label: q.question, secret: !!q.isSecret, required: true,
      options: (q.options ?? []).map((o: any) => ({ value: o.label, label: [o.label, o.description].filter(Boolean).join(' — ') })), freeText: !!q.isOther || !q.options?.length }));
    return { title: 'Your decision', detail: '', fields, actions: [{ value: 'submit', label: 'Send answer' }, cancelAction], cancel: { answers: {} },
      answer: a => a.action === 'cancel' ? { answers: {} } : { answers: Object.fromEntries(fields.map(f => [f.id, { answers: [a.values![f.id]] }])) } };
  }
  if (method !== 'mcpServer/elicitation/request') throw new Error(`This interaction needs the desktop: ${method}`);
  const unsupported = (reason: string): Spec => ({ title: 'Continue on your PC', detail: `${p.message}\n\n${reason}`, fields: [], actions: [cancelAction], cancel: formCancel, answer: () => formCancel });
  if (p.mode === 'url') return unsupported(`Open this address on your PC to complete the request: ${p.url}`);
  if (!['form', 'openai/form', 'openaiForm'].includes(p.mode)) return unsupported('This form cannot be answered on the watch yet.');
  const schema = p.requestedSchema;
  if (schema?.type !== 'object' || !schema.properties || Object.keys(schema.properties).length > 6) return unsupported('This form cannot be answered on the watch yet.');
  const fields: ApprovalField[] = [];
  for (const [id, raw] of Object.entries(schema.properties)) {
    const s = raw as any;
    if (!['boolean', 'string'].includes(s.type) || s.oneOf || s.anyOf || s.pattern || s.format || s.allOf) return unsupported('This form needs controls available on your PC.');
    const options = s.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
      : Array.isArray(s.enum) && s.enum.every((v: unknown) => typeof v === 'string') ? s.enum.map((v: string) => ({ value: v, label: v })) : [];
    fields.push({ id, label: [s.title || id, s.description].filter(Boolean).join('\n'), required: schema.required?.includes(id) ?? false,
      secret: !!s.writeOnly, options, freeText: s.type === 'string' && !options.length });
  }
  return { title: 'Approval requested', detail: p.message || p.serverName, fields,
    actions: [{ value: 'submit', label: fields.length ? 'Confirm choices' : 'Allow once' }, { value: 'decline', label: 'Deny' }, cancelAction], cancel: formCancel,
    answer: a => {
      if (a.action !== 'submit') return { action: a.action, content: null, _meta: null };
      const content: Record<string, unknown> = {};
      for (const f of fields) {
        const value = a.values?.[f.id]; if (value == null) continue;
        const s = schema.properties[f.id];
        if (s.type === 'string' && ((s.minLength != null && value.length < s.minLength) || (s.maxLength != null && value.length > s.maxLength))) throw new Error(`Check ${f.label}`);
        content[f.id] = s.type === 'boolean' ? value === 'true' : value;
      }
      return { action: 'accept', content, _meta: null };
    } };
}

/** Only real server requests enter this queue; model-authored reply cards cannot approve tools. */
export class WatchApprovals {
  private pending = new Map<string, { turnId: string; request: WatchApproval; spec: Spec; settle: (result: unknown) => void }>();
  private answered = new Map<string, { turnId: string; answer: string }>();
  constructor(private changed: (turnId: string) => void) {}
  list(turnId: string) { return [...this.pending.values()].filter(p => p.turnId === turnId).map(p => p.request); }
  request(turnId: string, method: string, params: any, signal: AbortSignal, attachments: DeviceAttachment[] = []): Promise<unknown> {
    const spec = approvalSpec(method, params);
    if (signal.aborted) return Promise.resolve(spec.cancel);
    if (JSON.stringify(spec).length > 32000) throw new Error('Approval is too large for the watch. Continue on your PC.');
    const id = randomUUID();
    return new Promise(resolve => {
      const settle = (result: unknown) => { clearTimeout(timer); signal.removeEventListener('abort', cancel); this.pending.delete(id); this.changed(turnId); resolve(result); };
      const cancel = () => settle(spec.cancel);
      const timer = setTimeout(cancel, 10 * 60_000);
      this.pending.set(id, { turnId, spec, request: { id, title: spec.title, detail: spec.detail, fields: spec.fields, actions: spec.actions, expiresAt: Date.now() + 10 * 60_000, ...(attachments.length ? { attachments } : {}) }, settle });
      signal.addEventListener('abort', cancel, { once: true }); this.changed(turnId);
    });
  }
  answer(turnId: string, id: string, answer: ApprovalAnswer) {
    const fingerprint = JSON.stringify({ action: answer.action, values: Object.entries(answer.values ?? {}).sort(([a], [b]) => a.localeCompare(b)) });
    const old = this.answered.get(id);
    if (old?.turnId === turnId && old.answer === fingerprint) return;
    const entry = this.pending.get(id);
    if (!entry || entry.turnId !== turnId) throw new Error('This approval has expired or was already answered');
    if (!entry.spec.actions.some(a => a.value === answer.action)) throw new Error('Invalid approval action');
    if (answer.action === 'submit') for (const field of entry.spec.fields) {
      const value = answer.values?.[field.id];
      if (value == null && !field.required) continue;
      if (typeof value !== 'string' || value.length > 4000 || (field.required && !value.trim()) || (!field.freeText && !field.options.some(o => o.value === value))) throw new Error(`Choose an answer for ${field.label}`);
    }
    const result = entry.spec.answer(answer);
    this.answered.set(id, { turnId, answer: fingerprint });
    if (this.answered.size > 100) this.answered.delete(this.answered.keys().next().value!);
    entry.settle(result);
  }
  cancel(turnId: string) { for (const entry of [...this.pending.values()]) if (entry.turnId === turnId) entry.settle(entry.spec.cancel); }
}
