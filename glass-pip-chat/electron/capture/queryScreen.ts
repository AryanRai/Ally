import { BrowserWindow, screen } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { captureDisplay } from './circle.js';

let pending = false;
/** One explicit query capture. No timers/recording and no cached prior screen. */
export async function queryScreen(main: BrowserWindow) {
  if (pending) throw Error('Screen attachment is already preparing');
  if (BrowserWindow.getAllWindows().some(window => window !== main && /Ally Visual Tutor|Circle to Ask/.test(window.getTitle()))) throw Error('Close the screen drawing/selection before auto-attaching a fresh screen');
  pending = true;
  const visible = main.isVisible();
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if (visible) { main.hide(); await new Promise(resolve => setTimeout(resolve, 160)); }
    const image = await captureDisplay(display);
    if (image.isEmpty()) throw Error('Screen capture unavailable');
    const bounded = image.getSize().width > 1920 ? image.resize({ width: 1920 }) : image;
    const dir = path.join(os.tmpdir(), 'ally-query-screens'); await fs.mkdir(dir, { recursive: true });
    for (const entry of await fs.readdir(dir)) if (/^query-[a-f0-9-]+\.png$/.test(entry)) {
      const file = path.join(dir, entry); if (Date.now() - (await fs.stat(file)).mtimeMs > 86400000) await fs.unlink(file).catch(() => {});
    }
    const file = path.join(dir, `query-${randomUUID()}.png`); await fs.writeFile(file, bounded.toPNG());
    return { path: file, thumbnail: `data:image/jpeg;base64,${bounded.resize({ width: 360 }).toJPEG(70).toString('base64')}` };
  } finally { pending = false; if (visible && !main.isDestroyed()) main.showInactive(); }
}
