import type { Message } from '../types/chat';
import type { InteractionHistory } from '../../electron/devices/interactions';
import { requestMessageIndex } from './activityRequests';

export function interactionTimeline(messages: Message[], decisions: InteractionHistory[]) {
  const owned = new Map<string, InteractionHistory[]>();
  const remaining = decisions.filter(request => {
    const index = requestMessageIndex(messages, request.createdAt);
    if (index < 0) return true;
    const id = messages[index].id; owned.set(id, [...owned.get(id) ?? [], request]); return false;
  });
  const rows = [
    ...messages.map(message => ({ kind: 'message' as const, message: owned.has(message.id) ? { ...message, metadata: { ...message.metadata, interactions: owned.get(message.id) } } : message, time: message.timestamp })),
    ...remaining.map(request => ({ kind: 'interaction' as const, request, time: request.createdAt ?? 0 })),
  ];
  return rows.sort((a, b) => a.time - b.time);
}
