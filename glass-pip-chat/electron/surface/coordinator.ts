import { app, BrowserWindow, ipcMain, screen } from 'electron';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { dockingDisplay, pillBounds, parseNativePoint, type Point } from './geometry.js';
import { setSharedGreeting } from './greeting.js';
import { interactions, type ChatInteraction } from '../devices/interactions.js';
import { handoffPresentation } from '../devices/handoffPresentation.js';

let controller: ReturnType<typeof createSurfaceCoordinator> | undefined;
export const studyPresentation = new EventEmitter();
export const submitNativeStudy = (id: string) => controller?.study(id) ?? Promise.reject(Error('Ally Study is unavailable. Open the native app and try again.'));
export const nativeDecisionStatus = () => controller?.decisionStatus() ?? { connected: false, supported: false, docked: false };
export const nativeStudyStatus = () => controller?.studyStatus() ?? { connected: false, captions: false };
export const presentDecisionOnNative = (request: ChatInteraction) => controller?.decision(request) ?? false;
export const revealFloatingSurface = () => controller?.float();
export const suspendNativeForCapture = () => controller?.suspend() ?? Promise.resolve();
export const restoreNativeAfterCapture = (focus: boolean) => controller?.restore(focus);

const focusFloatingWindow = (win: BrowserWindow) => {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
  win.webContents.send('focus-main-input');
};

/** The shortcut always leaves a usable surface, even without the native helper. */
export function toggleAllySurface(win: BrowserWindow | null | undefined) {
  if (controller) controller.toggle();
  else if (win) focusFloatingWindow(win);
}

/** One warm Electron window and one warm native notch; no rendering or cursor polling loop. */
export function createSurfaceCoordinator(win: BrowserWindow) {
  const token = randomBytes(32).toString('hex');
  const pipe = `ally-surface-${randomBytes(16).toString('hex')}`;
  const config = path.join(app.getPath('userData'), 'surface-bridge.txt');
  // The window may already be showing before registration; its earlier 'show' is not replayed.
  let peer: net.Socket | undefined, floating = win.isVisible(), capturing = false, userMoving = false;
  let hidden: (() => void) | undefined;
  let transfer = 0;
  let dragOrigin: Electron.Rectangle | undefined, returnBounds: Electron.Rectangle | undefined;
  let ready: { id: number; complete: () => void; timer: ReturnType<typeof setTimeout> } | undefined;
  // The pill's live reply and greeting, mirrored into the notch while docked.
  let preview: NotchPreview | undefined, greeting = '', arriving = false, sentPreview = '';
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const settingsWaiters: ((value: Record<string, unknown>) => void)[] = [];
  const studyWaiters = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let studyCaptions = false, nativeDecisions = false;
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
  const sendHandoff=(value:ReturnType<typeof handoffPresentation.snapshot>)=>{
    if(capturing||win.isDestroyed())return;
    if(docked())write(`HANDOFF ${encode(JSON.stringify(value))}`);
    else if(floating||win.isVisible())win.webContents.send('surface:handoff',value);
  };
  let sentDecisions = '';
  const flushDecisions = () => {
    if (!docked() || !nativeDecisions) return;
    const ids = interactions.list().filter(row => !row.desktopOnly).map(row => row.id).sort();
    const signature = JSON.stringify(ids);
    if(signature === sentDecisions) return;
    sentDecisions = signature;
    write(`DECISIONS ${encode(JSON.stringify({count:ids.length}))}`);
  };
  const stopDecisions = interactions.subscribe(() => flushDecisions());
  const stopHandoff=handoffPresentation.subscribe(sendHandoff);
  const restoreHandoff=()=>{const state=handoffPresentation.snapshot();if(state)sendHandoff(state);};
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
    if (floating) returnBounds = dragOrigin ?? win.getBounds();
    transfer++; floating = false; userMoving = false; arriving = true;
    // The helper acknowledges native visibility before we hide the pill.
    write('NOTCH');
  };
  const float = (point?: Point, drag = false) => {
    if (!peer) return;
    const id = ++transfer;
    if (point) { win.setBounds(pillBounds(point, screen.getDisplayNearestPoint(point).workArea), false); returnBounds = undefined; }
    else if (returnBounds) {
      const area = screen.getDisplayNearestPoint(returnBounds).workArea;
      const saved = returnBounds; returnBounds = undefined;
      const restored = { ...saved, x: Math.max(area.x, Math.min(saved.x, area.x + area.width - saved.width)), y: Math.max(area.y, Math.min(saved.y, area.y + area.height - saved.height)) };
      const current = win.getBounds();
      if (Object.keys(restored).some(key => restored[key as keyof typeof restored] !== current[key as keyof typeof current])) win.setBounds(restored, false);
    }
    const show = () => {
      if (id !== transfer || !peer || capturing || win.isDestroyed()) return;
      floating = true; write('HIDE');
      win.showInactive(); win.moveTop();
      restoreHandoff();
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
      // A native caption is JSON with chips as well as text (base64 UTF-8).
      if (buffer.length > (authenticated ? 196608 : 8192)) { socket.destroy(); return; }
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
          sentDecisions = ''; flushDecisions();
          restoreHandoff();
          continue;
        }
        if (line === 'DECISIONS_READY') { nativeDecisions = true; sentDecisions = ''; flushDecisions(); continue; }
        if (line === 'HIDDEN') { hidden?.(); hidden = undefined; continue; }
        if (line === 'STUDY_BOUND 1' || line === 'STUDY_BOUND 0') { studyCaptions = line.endsWith('1'); continue; }
        if (line.startsWith('STUDY_ACCEPTED ') || line.startsWith('STUDY_ERROR ')) {
          const [, id, detail] = line.split(' '), pending = studyWaiters.get(id);
          if (pending) {
            clearTimeout(pending.timer); studyWaiters.delete(id);
            if (line.startsWith('STUDY_ACCEPTED ')) pending.resolve();
            else pending.reject(Error(detail ? Buffer.from(detail, 'base64').toString('utf8').slice(0, 500) : 'Study could not start.'));
          }
          continue;
        }
        if (line.startsWith('STUDY_CAPTION ')) {
          const caption = Buffer.from(line.slice(14), 'base64').toString('utf8');
          if (caption.length <= 32768) studyPresentation.emit('caption', caption);
          continue;
        }
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
      studyCaptions = false; nativeDecisions = false; sentDecisions = '';
      for (const pending of studyWaiters.values()) { clearTimeout(pending.timer); pending.reject(Error('Study connection ended. Check the chat before retrying.')); }
      studyWaiters.clear();
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
  const moving = () => { if (!userMoving) dragOrigin = win.getBounds(); userMoving = true; };
  const moved = () => {
    if (userMoving && floating && !capturing && dockingDisplay(screen.getCursorScreenPoint(), screen.getAllDisplays().map(d => d.bounds), win.getBounds())) dock();
    userMoving = false; dragOrigin = undefined;
  };
  win.on('will-move', moving);
  win.on('moved', moved);
  win.on('show', () => { if (peer && !floating && !capturing) { floating = true; write('HIDE'); } });
  const dispose = () => {
    stopHandoff(); stopDecisions();
    write('NOTCH'); peer?.destroy(); server.close();
    if (ready) clearTimeout(ready.timer);
    clearTimeout(idleTimer);
    for (const pending of studyWaiters.values()) { clearTimeout(pending.timer); pending.reject(Error('Ally is closing.')); }
    studyWaiters.clear();
    ipcMain.removeListener('surface:ready', rendererReady);
    ipcMain.removeListener('surface:preview', rendererPreview);
    ipcMain.removeHandler('surface:native-settings');
    win.removeListener('will-move', moving);
    win.removeListener('moved', moved);
    try { if (fs.readFileSync(config, 'utf8').includes(token)) fs.unlinkSync(config); } catch {}
  };
  app.once('will-quit', dispose);
  return {
    decision(request: ChatInteraction): boolean {
      if (!docked() || !nativeDecisions || request.desktopOnly) return false;
      flushDecisions(); return true;
    },
    decisionStatus: () => ({ connected: !!peer, supported: nativeDecisions, docked: docked() }),
    studyStatus: () => ({ connected: !!peer, captions: studyCaptions }),
    study(id: string): Promise<void> {
      if (!peer || capturing) return Promise.reject(Error('Ally Study is not ready. Finish the selection and try again.'));
      if (!/^[a-f0-9-]{36}$/.test(id)) return Promise.reject(Error('Invalid Study request.'));
      if (studyWaiters.has(id)) return Promise.reject(Error('This Study request is already starting.'));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { studyWaiters.delete(id); reject(Error('Study may have started. Check the same chat before retrying.')); }, 5000);
        studyWaiters.set(id, { resolve, reject, timer }); write(`STUDY ${id}`);
      });
    },
    float,
    toggle() {
      if (capturing || win.isDestroyed()) return;
      if (!peer) { floating = true; focusFloatingWindow(win); return; }
      if (peer && floating) { dock(); return; }
      float();
      focusFloatingWindow(win);
    },
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
