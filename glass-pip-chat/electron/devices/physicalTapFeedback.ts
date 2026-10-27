import { BrowserWindow, screen } from 'electron';
import { physicalTapArrivalHtml } from './physicalTapVisual.js';

/** Finite, inert local feedback. No screen bytes, links, input, chat selection or model work. */
export function physicalTapFeedback() {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const win = new BrowserWindow({ width: 420, height: 300, x: area.x + Math.round((area.width-420)/2), y: area.y + area.height - 315,
    frame: false, transparent: true, focusable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.setIgnoreMouseEvents(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.once('ready-to-show', () => win.showInactive());
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(physicalTapArrivalHtml)).catch(() => { if (!win.isDestroyed()) win.destroy(); });
  setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 3300).unref();
}
