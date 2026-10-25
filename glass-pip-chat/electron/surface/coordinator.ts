import { app, BrowserWindow, ipcMain, screen } from 'electron';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { dockingDisplay, pillBounds, parseNativePoint, type Point } from './geometry.js';
import { setSharedGreeting } from './greeting.js';

let controller: ReturnType<typeof createSurfaceCoordinator> | undefined;
export const revealFloatingSurface = () => controller?.float();
export const suspendNativeForCapture = () => controller?.suspend() ?? Promise.resolve();
export const restoreNativeAfterCapture = (focus: boolean) => controller?.restore(focus);

/** One warm Electron window and one warm native notch; no rendering or cursor polling loop. */
export function createSurfaceCoordinator(win: BrowserWindow) {
  const token = randomBytes(32).toString('hex');
  const pipe = `ally-surface-${randomBytes(16).toString('hex')}`;
  const config = path.join(app.getPath('userData'), 'surface-bridge.txt');
  // The window may already be showing before registration; its earlier 'show' is not replayed.
  let peer: net.Socket | undefined, floating = win.isVisible(), capturing = false, userMoving = false;
  let hidden: (() => void) | undefined;
  let transfer = 0;
  let ready: { id: number; complete: () => void; timer: ReturnType<typeof setTimeout> } | undefined;
  // The pill's live reply and greeting, mirrored into the notch while docked.
  let preview: NotchPreview | undefined, greeting = '', arriving = false, sentPreview = '';
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const settingsWaiters: ((value: Record<string, unknown>) => void)[] = [];
  /** Native notch preferences, shown in Ally's single Settings window. */
  const nativeSettings = (change?: { key: string; value: string | number | boolean }) => new Promise<Record<string, unknown> | null>(resolve => {
    if (!peer) { resolve(null); return; }
    const timer = setTimeout(() => { const i = settingsWaiters.indexOf(done); if (i >= 0) settingsWaiters.splice(i, 1); resolve(null); }, 1500);
    const done = (value: Record<string, unknown>) => { clearTimeout(timer); resolve(value); };
    settingsWaiters.push(done);
    write(change && /^[A-Za-z]+$/.test(change.key) ? `SET ${change.key} ${encode(String(change.value))}` : 'GETSETTINGS');
  });
  const settingsHandler = (event: Electron.IpcMainInvokeEvent, change?: { key: string; value: string | number | boolean }) =>
    event.sender === win.webContents ? nativeSettings(change && typeof change.key === 'string' ? change : undefined) : null;
  ipcMain.handle('surface:native-settings', settingsHandler);
  const write = (line: string) => peer?.write(line + '\n');
  const docked = () => !!peer && !floating && !capturing;
  const flushPreview = () => {
    if (!docked()) return;
    clearTimeout(idleTimer); idleTimer = undefined;
    if (!preview) { if (sentPreview) { sentPreview = ''; write('IDLE'); } return; }
    const line = previewLine(preview);
    if (line !== sentPreview) { sentPreview = line; write(line); }
    if (preview.done) idleTimer = setTimeout(() => { sentPreview = ''; write('IDLE'); }, readingDelay(preview.answer));
  };
  const dock = () => {
    if (!peer || capturing) return;
    transfer++; floating = false; userMoving = false; arriving = true;
    // The helper acknowledges native visibility before we hide the pill.
    write('NOTCH');
  };
  const float = (point?: Point, drag = false) => {
    if (!peer) return;
    const id = ++transfer;
    if (point) win.setBounds(pillBounds(point, screen.getDisplayNearestPoint(point).workArea), false);
    const show = () => {
      if (id !== transfer || !peer || capturing || win.isDestroyed()) return;
      floating = true; write('HIDE');
      win.showInactive(); win.moveTop();
      if (drag) {
        const handle = win.getNativeWindowHandle();
        write(`DRAG ${handle.length === 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString()}`);
      }
    };
    if (!drag) { show(); return; }
    if (ready) clearTimeout(ready.timer);
    ready = { id, complete: show, timer: setTimeout(() => { ready = undefined; }, 1500) };
    win.webContents.send('surface:float', id);
  };
  const rendererReady = (event: Electron.IpcMainEvent, id: unknown) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || id !== ready?.id) return;
    const pending = ready; ready = undefined;
    if (pending) { clearTimeout(pending.timer); pending.complete(); }
  };
  ipcMain.on('surface:ready', rendererReady);
  const rendererPreview = (event: Electron.IpcMainEvent, next: unknown) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
    const value = parsePreview(next);
    if (value === undefined) return;
    preview = value.preview ?? undefined;
    if (typeof value.greeting === 'string') { greeting = value.greeting.slice(0, 120); setSharedGreeting(greeting); }
    if (value.preview !== undefined) flushPreview();
  };
  ipcMain.on('surface:preview', rendererPreview);
  const server = net.createServer(socket => {
    let authenticated = false, buffer = '';
    const timeout = setTimeout(() => socket.destroy(), 3000);
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 4096) { socket.destroy(); return; }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (!authenticated) {
          if (line !== `AUTH ${token}` || peer) { socket.destroy(); return; }
          clearTimeout(timeout); authenticated = true; peer = socket;
          write(floating || capturing ? 'HIDE' : 'NOTCH');
          continue;
        }
        if (line === 'SHOWN') {
          if (floating || capturing) continue;
          win.hide();
          // Arrive visibly: a running reply takes priority, otherwise Ally's greeting.
          if (preview && !preview.done) { sentPreview = ''; flushPreview(); }
          else if (arriving && greeting) write(`GREET ${encode(greeting)}`);
          arriving = false;
          continue;
        }
        if (line === 'HIDDEN') { hidden?.(); hidden = undefined; continue; }
        if (line.startsWith('SETTINGS ')) {
          let value: Record<string, unknown> = {};
          try { value = JSON.parse(Buffer.from(line.slice(9), 'base64').toString('utf8')); } catch {}
          settingsWaiters.splice(0).forEach(resolve => resolve(value));
          continue;
        }
        const words = line.split(' ');
        if (words[0] === 'DETACH' && !floating && !capturing) {
          const point = parseNativePoint(words, p => screen.screenToDipPoint(p));
          if (point) float(point, true);
        }
      }
    });
    socket.on('close', () => {
      clearTimeout(timeout);
      if (peer !== socket) return;
      transfer++; peer = undefined; hidden = undefined;
      if (!win.isDestroyed()) win.showInactive();
    });
  });
  server.on('error', error => console.error('Ally surface connection:', error.message));
  server.listen(`\\\\.\\pipe\\${pipe}`, () => {
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.writeFileSync(config + '.staged', `${pipe}\n${token}\n`, { mode: 0o600 });
    fs.renameSync(config + '.staged', config);
  });
  // Electron reports actual user moves separately from resize/setBounds, including
  // Chromium's frameless drag regions. Raw HWND move-loop messages are insufficient.
  const moving = () => { userMoving = true; };
  const moved = () => {
    if (userMoving && floating && !capturing && dockingDisplay(screen.getCursorScreenPoint(), screen.getAllDisplays().map(d => d.bounds), win.getBounds())) dock();
    userMoving = false;
  };
  win.on('will-move', moving);
  win.on('moved', moved);
  win.on('show', () => { if (peer && !floating && !capturing) { floating = true; write('HIDE'); } });
  const dispose = () => {
    write('NOTCH'); peer?.destroy(); server.close();
    if (ready) clearTimeout(ready.timer);
    clearTimeout(idleTimer);
    ipcMain.removeListener('surface:ready', rendererReady);
    ipcMain.removeListener('surface:preview', rendererPreview);
    ipcMain.removeHandler('surface:native-settings');
    win.removeListener('will-move', moving);
    win.removeListener('moved', moved);
    try { if (fs.readFileSync(config, 'utf8').includes(token)) fs.unlinkSync(config); } catch {}
  };
  app.once('will-quit', dispose);
  return {
    float,
    async suspend() {
      if (!peer) return;
      transfer++; capturing = true;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { hidden = undefined; capturing = false; write(floating ? 'HIDE' : 'NOTCH'); reject(Error('Ally notch did not hide. Try Circle again.')); }, 1500);
        hidden = () => { clearTimeout(timer); resolve(); };
        write('HIDE');
      });
    },
    restore(focus: boolean): boolean {
      if (!peer || !capturing) return false;
      capturing = false;
      if (focus || floating) float(); else dock();
      return true;
    },
  };
}

export type NotchPreview = { question: string; answer: string; thinking: boolean; done: boolean };

const encode = (text: string) => Buffer.from(text, 'utf8').toString('base64');

/** The notch shows a glanceable tail of the reply; the full chat stays in Ally. */
export function previewLine(p: NotchPreview): string {
  const answer = p.answer.length > 600 ? '…' + p.answer.slice(-600).replace(/^\S*\s/, '') : p.answer;
  return `PREVIEW ${p.thinking && !p.done ? 1 : 0} ${encode(p.question.slice(0, 200))} ${encode(answer)}`;
}

/** Same reading-time tiers as the native text response (10/20/30 s). */
export function readingDelay(answer: string): number {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  return (words > 90 ? 30 : words > 32 ? 20 : 10) * 1000;
}

function parsePreview(value: unknown): { preview?: NotchPreview | null; greeting?: string } | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  const out: { preview?: NotchPreview | null; greeting?: string } = {};
  if (typeof v.greeting === 'string') out.greeting = v.greeting;
  if (v.preview === null) out.preview = null;
  else if (v.preview && typeof v.preview === 'object') {
    const p = v.preview as Record<string, unknown>;
    if (typeof p.question !== 'string' || typeof p.answer !== 'string') return;
    out.preview = { question: p.question, answer: p.answer, thinking: p.thinking === true, done: p.done === true };
  }
  return out;
}

export function registerSurfaceCoordinator(win: BrowserWindow) {
  if (process.platform === 'win32') controller = createSurfaceCoordinator(win);
}
