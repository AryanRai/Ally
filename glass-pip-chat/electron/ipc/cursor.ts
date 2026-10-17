// Global cursor feed for the avatar's eyes (the cursor is usually outside Ally's window).
import { ipcMain, screen } from 'electron';
import { getWindow, sendToRenderer } from '../window.js';

const SAMPLE_MS = 33;
let timer: NodeJS.Timeout | null = null;

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function registerCursorIpc(): void {
  ipcMain.on('cursor:watch', (_, on: boolean) => {
    stop();
    if (!on) return;
    let last = '';
    timer = setInterval(() => {
      const win = getWindow();
      if (!win || win.isDestroyed() || !win.isVisible()) return;
      const cursor = screen.getCursorScreenPoint();
      const origin = win.getContentBounds();
      // Window-relative, like a DOM clientX/clientY (may be far outside the window)
      const x = cursor.x - origin.x;
      const y = cursor.y - origin.y;
      const key = `${x},${y}`;
      if (key === last) return;
      last = key;
      sendToRenderer('cursor:moved', { x, y });
    }, SAMPLE_MS);
  });
}

export const stopCursorWatch = stop;
