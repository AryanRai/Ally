import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ focused: false, enabled: true, show: vi.fn(), send: vi.fn(), focus: vi.fn(), click: null as null | (() => void) }));
vi.mock('electron', () => ({ app: {}, ipcMain: {}, Notification: class { static isSupported() { return true; } on(_: string, fn: () => void) { mocks.click = fn; } show = mocks.show; } }));
vi.mock('./window.js', () => ({ getWindow: () => ({ isFocused: () => mocks.focused, show: mocks.focus, focus: vi.fn(), webContents: { send: mocks.send } }) }));
vi.mock('./speech/settings.js', () => ({ speechSettings: () => ({ notifications: mocks.enabled }) }));
beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); mocks.enabled = true; mocks.focused = false; });
it('notifies once and opens the exact original chat on click', async () => {
  const { notifyReply } = await import('./notifications');
  const notice = { id: 'turn', chatId: 'exact-chat', title: 'Reply', text: 'Done' };
  notifyReply(notice); notifyReply(notice); expect(mocks.show).toHaveBeenCalledTimes(1);
  mocks.click?.(); expect(mocks.send).toHaveBeenCalledWith('reply:open', { chatId: 'exact-chat', session: undefined });
});
it('respects focus and the notification switch', async () => {
  const { notifyReply } = await import('./notifications');
  mocks.focused = true; notifyReply({ id: 'a', title: 'Reply', text: 'Done' });
  mocks.focused = false; mocks.enabled = false; notifyReply({ id: 'b', title: 'Reply', text: 'Done' });
  expect(mocks.show).not.toHaveBeenCalled();
});
