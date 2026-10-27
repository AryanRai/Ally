import type { ReplyNotice } from '../notifications.js';
import type { DeviceCard, DeviceKind } from './hub.js';
import { chatTitle } from '../agent/chatTitle.js';
import { unreadState } from '../agent/unread.js';
import { replyPreview } from '../watch/presentation.js';

/** Route by native identity, never by text that happens to mention permission. */
export function replyCard(notice: ReplyNotice, device: DeviceKind): DeviceCard {
  const key = notice.session ? `${notice.session.provider}:${notice.session.id}` : notice.chatId;
  const chatId = key && /^(codex|claude):[\w-]{8,100}$/.test(key) ? key : undefined;
  const revision = notice.readRevision || (notice.session && unreadState(notice.session.provider,notice.session.id).revision);
  return { id: `reply:${device}:${chatId && revision ? `${chatId}:${revision}` : notice.id}`, kind: notice.kind ?? 'response', title: chatTitle(notice.session?.title || notice.title),
    body: replyPreview(notice.text), chatId, sessionId: notice.session?.id, provider: notice.session?.provider, createdAt: Date.now() };
}
