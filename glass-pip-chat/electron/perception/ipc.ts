// `perception:*` IPC (see preload `pip.perception`). Events stream to the
// window as `perception:event` (PerceptionPush).
import { app, desktopCapturer, ipcMain, session, type BrowserWindow } from 'electron';
import { notifyReply } from '../notifications.js';
import { PerceptionEngine, type StartOptions } from './engine.js';
import { loadPerceptionSettings, publicSettings, type PerceptionSettings } from './settings.js';
import type { AssistCard, AudioSource, CaptureToggles, PerceptionMode } from './types.js';

let engine: PerceptionEngine | null = null;
const cardListeners = new Set<(card: AssistCard) => void>();

/** Every admitted card (desktop already handled here). For phone/watch delivery. */
export function onAssistCard(cb: (card: AssistCard) => void): () => void {
  cardListeners.add(cb);
  return () => cardListeners.delete(cb);
}

/** Dismissed on another device: cools the topic like the desktop dismiss. */
export function dismissAssistCard(id: string): void {
  engine?.dismissCard(id);
}

/** Recent observed context as text (circle-to-ask, other modules). Empty when no session. */
export function perceptionContext(ms = 30_000): string {
  return engine?.status().session ? engine.contextText(ms) : '';
}

/**
 * getDisplayMedia in Ally returns the primary screen plus system audio
 * (WASAPI loopback on Windows), so perception can hear meetings and videos.
 */
function allowLoopbackCapture(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
      const screen = sources[0];
      if (!screen) { callback({}); return; }
      callback(process.platform === 'win32' ? { video: screen, audio: 'loopback' } : { video: screen });
    }).catch(() => callback({}));
  });
}

export function registerPerceptionIpc(getWindow: () => BrowserWindow | null): void {
  engine = new PerceptionEngine(push => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('perception:event', push);
    // Important notes also raise a desktop notification when Ally isn't focused
    // (notifyReply skips focused windows and honours the notification setting).
    // Device priorities use the card listeners; desktop notices must not fan out again.
    if (push.type === 'card' && !push.card.dismissed) {
      for (const cb of cardListeners) { try { cb(push.card); } catch { /* a listener must not break the engine */ } }
    }
    if (push.type === 'card' && !push.card.dismissed && ['desktop', 'phone', 'watch'].includes(push.card.priority)) {
      const session = engine?.status().session;
      notifyReply({
        desktopOnly: true,
        id: push.card.id,
        title: push.card.title,
        text: push.card.body,
        session: session ? { id: session.sessionId, provider: session.provider, title: session.title, cwd: session.cwd ?? '' } : undefined,
      });
    }
  });
  const e = engine;
  void app.whenReady().then(allowLoopbackCapture);
  app.on('will-quit', () => e.shutdown());

  ipcMain.handle('perception:status', () => e.status());
  ipcMain.handle('perception:cards', () => e.cardsList());
  ipcMain.handle('perception:recent', (_, ms: number) => e.recent(Math.min(Math.max(ms, 1000), 10 * 60_000)));
  ipcMain.handle('perception:context', (_, ms?: number) => e.contextText(ms));
  ipcMain.handle('perception:start', (_, opts: StartOptions) => e.start(opts));
  ipcMain.handle('perception:pause', () => e.pause());
  ipcMain.handle('perception:resume', () => e.resume());
  ipcMain.handle('perception:stop', () => e.stop());
  ipcMain.handle('perception:setMode', (_, mode: PerceptionMode) => e.setMode(mode));
  ipcMain.handle('perception:setCapture', (_, patch: Partial<CaptureToggles>) => e.setCapture(patch));
  ipcMain.handle('perception:setQuiet', (_, quiet: boolean) => e.setQuiet(quiet));
  ipcMain.handle('perception:fork', () => e.fork());
  ipcMain.handle('perception:ask', (_, question: string, contextMs?: number) => e.ask(String(question), contextMs));
  ipcMain.handle('perception:stopTurn', () => e.stopTurn());
  ipcMain.handle('perception:dismiss', (_, id: string) => e.dismissCard(id));
  ipcMain.handle('perception:getSettings', () => publicSettings(loadPerceptionSettings()));
  ipcMain.handle('perception:updateSettings', (_, patch: Partial<PerceptionSettings>) => publicSettings(e.updateSettings(patch)));

  // Audio arrives as fire-and-forget messages (≈10 per second per source while speaking)
  ipcMain.on('perception:audioBegin', (_, source: AudioSource, id: string) => e.audioBegin(source, id));
  ipcMain.on('perception:audioChunk', (_, id: string, pcm: ArrayBuffer | Uint8Array) => e.audioChunk(id, pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm)));
  ipcMain.on('perception:audioEnd', (_, source: AudioSource, id: string) => e.audioEnd(source, id));
  ipcMain.on('perception:audioError', (_, source: AudioSource, message: string) => e.audioError(source, String(message)));
}
