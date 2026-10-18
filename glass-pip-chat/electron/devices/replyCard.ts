import type { ReplyNotice } from '../notifications.js';
import type { DeviceCard, DeviceKind } from './hub.js';
import { unreadState } from '../agent/unread.js';

/** Route by native identity, never by text that happens to mention permission. */
export function replyCard(notice: ReplyNotice, device: DeviceKind): DeviceCard {
  const key = notice.session ? `${notice.session.provider}:${notice.session.id}` : notice.chatId;
  const chatId = key && /^(codex|claude):[\w-]{8,100}$/.test(key) ? key : undefined;
  const revision = notice.readRevision || (notice.session && unreadState(notice.session.provider,notice.session.id).revision);
  return { id: `reply:${device}:${chatId && revision ? `${chatId}:${revision}` : notice.id}`, kind: 'response', title: notice.session?.title || notice.title,
    body: notice.text, chatId, sessionId: notice.session?.id, provider: notice.session?.provider, createdAt: Date.now() };
}
