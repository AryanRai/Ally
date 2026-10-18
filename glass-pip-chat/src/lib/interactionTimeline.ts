import type { Message } from '../types/chat';
import type { InteractionHistory } from '../../electron/devices/interactions';

export function interactionTimeline(messages: Message[], decisions: InteractionHistory[]) {
  const rows = [
    ...messages.map(message => ({ kind: 'message' as const, message, time: message.timestamp })),
    ...decisions.filter(request => request.state !== 'pending').map(request => ({ kind: 'interaction' as const, request, time: request.createdAt ?? 0 })),
  ];
  return rows.sort((a, b) => a.time - b.time);
}
