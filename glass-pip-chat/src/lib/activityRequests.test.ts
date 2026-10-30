import { expect, it } from 'vitest';
import { requestAnchor, requestMessageIndex } from './activityRequests';
import { interactionTimeline } from './interactionTimeline';
import type { InteractionHistory } from '../../electron/devices/interactions';
import type { Message } from '../types/chat';
it('anchors a question to its in-flight command rather than the final reply timestamp', () => {
  expect(requestAnchor(25, [{id:'ask',startedAt:20,endedAt:40},{id:'other',startedAt:22,endedAt:23}])).toBe('ask');
  expect(requestAnchor(10,[{id:'later',startedAt:20}])).toBeUndefined();
});
it('assigns each question once even when a turn has several assistant messages',()=>{
  const messages=[{role:'user',timestamp:10},{role:'assistant',timestamp:15,steps:[{id:'read',startedAt:12,endedAt:14}]},{role:'assistant',timestamp:35,steps:[{id:'ask',startedAt:20,endedAt:30}]},{role:'user',timestamp:40}];
  expect(requestMessageIndex(messages,25)).toBe(2);
  expect(requestMessageIndex(messages,50)).toBe(-1);
});
it('keeps a real question inside the originating assistant turn across later messages', () => {
  const messages: Message[] = [{id:'u1',role:'user',content:'First',timestamp:10},{id:'a1',role:'assistant',content:'Answer',timestamp:30},{id:'u2',role:'user',content:'Second',timestamp:40}];
  const request = {id:'question',createdAt:20,state:'answered'} as InteractionHistory;
  const rows=interactionTimeline(messages,[request]);
  expect(rows).toHaveLength(3);
  expect(rows[1].kind==='message' && rows[1].message.metadata?.interactions).toEqual([request]);
  expect(messages[1].metadata).toBeUndefined();
});
