import type { BrowserWindow } from 'electron';

/** Electron's Windows "floating" level is below the native topmost boundary. */
export function restoreFloatingLevel(win: BrowserWindow | null | undefined): void {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, process.platform === 'win32' ? 'pop-up-menu' : 'floating');
}

/** Restore a lost native topmost flag without taking focus or revealing a docked window. */
export function keepWindowFloating(win: BrowserWindow): () => void {
  let restoring = false;
  const restore = () => {
    if (restoring || win.isDestroyed() || win.isAlwaysOnTop()) return;
    restoring = true;
    try { restoreFloatingLevel(win); } finally { restoring = false; }
  };
  win.on('show', restore);
  win.on('restore', restore);
  win.on('blur', restore);
  win.on('moved', restore);
  win.on('always-on-top-changed', restore);
  restore();
  const dispose = () => {
    win.removeListener('show', restore);
    win.removeListener('restore', restore);
    win.removeListener('blur', restore);
    win.removeListener('moved', restore);
    win.removeListener('always-on-top-changed', restore);
  };
  win.once('closed', dispose);
  return dispose;
}
