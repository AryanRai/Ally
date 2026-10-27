import type { BrowserWindow } from 'electron';

/** Shutdown can destroy a window before feature cleanup publishes its final state. */
export function safeWindowSend(window: BrowserWindow | null | undefined, channel: string, value: unknown): boolean {
  if (!window || window.isDestroyed()) return false;
  const contents = window.webContents;
  if (contents.isDestroyed()) return false;
  contents.send(channel, value);
  return true;
}
