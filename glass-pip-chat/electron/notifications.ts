import { app, ipcMain, Notification } from 'electron';
import { getWindow } from './window.js';
import { speechSettings } from './speech/settings.js';

const shown = new Set<string>();
const replyListeners = new Set<(notice: ReplyNotice) => void>();
export function onReplyNotice(listener: (notice: ReplyNotice) => void): () => void {
  replyListeners.add(listener); return () => { replyListeners.delete(listener); };
}
export interface ReplyNotice { id: string; chatId?: string; title: string; text: string; desktopOnly?: boolean; session?: { id: string; provider: 'codex' | 'claude'; title: string; cwd: string } }
export function notifyReply(notice: ReplyNotice): void {
  if (!notice || typeof notice.id !== 'string' || typeof notice.text !== 'string' || shown.has(notice.id)) return;
  shown.add(notice.id); if (shown.size > 500) shown.delete(shown.values().next().value!);
  if (!notice.desktopOnly) for (const listener of replyListeners) { try { listener(notice); } catch { /* A device must not break desktop alerts. */ } }
  if (!speechSettings().notifications || !Notification.isSupported() || getWindow()?.isFocused()) return;
  const notification = new Notification({ title: (notice.title || 'Ally reply').slice(0, 80), body: notice.text.slice(0, 180) || 'Your response is ready.' });
  notification.on('click', () => { const win = getWindow(); win?.show(); win?.focus(); win?.webContents.send('reply:open', { chatId: notice.chatId, session: notice.session }); });
  notification.show();
}
export function registerReplyNotifications(): void {
  if (process.platform === 'win32') app.setAppUserModelId('com.droidcore.glasspip');
  ipcMain.on('reply:notify', (_, notice: ReplyNotice) => notifyReply(notice));
}
