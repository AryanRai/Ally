/** Tiny per-chat reader bookmark; never contains transcript or unread state. */
export interface ReplyPosition { responseId?: string; historyId: string | null; top: number; expanded: boolean; following: boolean }
const key = (chatId: string) => `ally-reply-position:${chatId}`;
export function loadReplyPosition(chatId?: string): ReplyPosition | undefined {
  if (!chatId) return;
  try {
    const value = JSON.parse(localStorage.getItem(key(chatId)) || 'null');
    if (value && (value.historyId === null || typeof value.historyId === 'string') &&
      Number.isFinite(value.top) && value.top >= 0 && typeof value.expanded === 'boolean' && typeof value.following === 'boolean') return value;
  } catch { /* A corrupt bookmark must not prevent opening the chat. */ }
}
export function saveReplyPosition(chatId: string | undefined, value: ReplyPosition): void {
  if (!chatId) return;
  try { localStorage.setItem(key(chatId), JSON.stringify(value)); } catch { /* Keep reading if storage is full. */ }
}
