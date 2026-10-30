import { useEffect, useState, type ReactNode } from 'react';
import { AgentReply } from './ChatMessage';
import ChatInteractionCard from './ChatInteractionCard';
import { requestAnchor } from '@/lib/activityRequests';
import type { InteractionHistory } from '../../../electron/devices/interactions';
import type { ApprovalAnswer } from '../../../electron/watch/approvals';

export interface DeviceAsset { id: string; name: string; mimeType: string; size: number; url: string }
export interface DeviceStep { id: string; name: string; status: string; detail?: string; context?: string; attachments?: DeviceAsset[]; startedAt?: number; endedAt?: number }
export type DeviceActivity = { id: string; type: 'update'; text: string } | { id: string; type: 'tool'; stepId: string } | { id: string; type: 'request'; request: InteractionHistory };
export interface DeviceActivityContent { steps?: DeviceStep[]; timeline?: DeviceActivity[]; commentary?: string[]; durationMs?: number }
export function activityRows(value: DeviceActivityContent, requests: InteractionHistory[] = []): DeviceActivity[] {
  const rows = value.timeline?.length ? [...value.timeline] : (value.commentary ?? []).map((text, i) => ({ id: `update:${i}`, type: 'update' as const, text }));
  const seen = new Set(rows.flatMap(row => row.type === 'tool' ? [row.stepId] : []));
  for (const step of value.steps ?? []) if (!seen.has(step.id)) { rows.push({ id: `tool:${step.id}`, type: 'tool', stepId: step.id }); seen.add(step.id); }
  const anchored = requests.map(request => ({ request, anchor: requestAnchor(request.createdAt, value.steps ?? []) }));
  return [...rows.flatMap(row => [row, ...anchored.filter(item => item.anchor && row.type === 'tool' && item.anchor === row.stepId).map(item => ({ id: `request:${item.request.id}`, type: 'request' as const, request: item.request }))]), ...anchored.filter(item => !item.anchor).map(item => ({ id: `request:${item.request.id}`, type: 'request' as const, request: item.request }))];
}
export function DeviceActivityReply({ content, text, working = false, startedAt, action, renderAsset, requests = [], onAnswerRequest }: { content: DeviceActivityContent; text: string; working?: boolean; startedAt?: number; action?: string; renderAsset?: (asset: DeviceAsset) => ReactNode; requests?: InteractionHistory[]; onAnswerRequest?: (id: string, answer: ApprovalAnswer) => Promise<unknown> }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!working) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [working]);
  const rows = activityRows(content, requests), steps = content.steps ?? [];
  const elapsed = content.durationMs ?? (working && startedAt ? Math.max(0, now - startedAt) : 0);
  const time = elapsed > 0 ? ` · ${Math.floor(elapsed / 60000) ? `${Math.floor(elapsed / 60000)}m ` : ''}${Math.floor(elapsed / 1000) % 60}s` : '';
  const groups: DeviceActivity[][] = [];
  for (const row of rows) {
    if (row.type === 'tool' && groups.at(-1)?.[0].type === 'tool') groups.at(-1)!.push(row);
    else groups.push([row]);
  }
  const render = () => groups.map((group, i) => group[0].type === 'request'
    ? <ChatInteractionCard key={group[0].id} request={group[0].request} onAnswer={onAnswerRequest ?? (async () => { throw Error('Open the originating chat to answer.'); })}/>
    : group[0].type === 'update'
    ? <div key={group[0].id} className="commentary"><AgentReply text={group[0].text} /></div>
    : <details key={group[0].id} className="my-2 text-xs text-foreground/55"><summary className="cursor-pointer py-2">{working && i === groups.length - 1 ? `${action || 'Working…'}${time}` : 'Thinking'} · {group.length} steps</summary>
      {group.map(row => { const step = row.type === 'tool' ? steps.find(step => step.id === row.stepId) : undefined; return step ? <details key={step.id} className="py-2"><summary className="cursor-pointer">{step.status === 'running' ? '◌' : step.status === 'error' ? '!' : step.status === 'interrupted' ? '−' : '✓'} {step.name}{step.context ? ` · ${step.context}` : ''}</summary><pre className="whitespace-pre-wrap break-words p-2">{step.detail || 'No additional detail'}</pre>{step.attachments?.map(asset => <div key={asset.id}>{renderAsset?.(asset)}</div>)}</details> : null; })}
    </details>);
  return <>
    {!working && rows.length > 0 && !requests.some(row => row.state === 'pending') ? <details className="my-2 text-xs text-foreground/55" key="completed"><summary className="cursor-pointer py-2">Activity · {steps.length} steps · {rows.filter(row => row.type === 'update').length} updates{time}</summary>{render()}</details> : render()}
    {working && groups.at(-1)?.[0].type !== 'tool' && <p role="status" className="text-xs text-foreground/55">◌ {action || 'Working…'} · {steps.length} steps{time}</p>}
    {!!text && <AgentReply text={text} streaming={working} />}
  </>;
}
