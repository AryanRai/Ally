// Circle to Ask: freeze the screen, let the user circle something, hand the crop to the agent.
import { app, BrowserWindow, desktopCapturer, ipcMain, NativeImage, screen } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindow } from '../window.js';
import { CircleHandoff, circleRegion, type CircleCapture } from './circleHandoff.js';
import type { CircleAsk, CircleSubmit, CircleContext } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTURE_DIR = path.join(os.tmpdir(), 'ally-captures');
const MAX_CAPTURE_AGE_MS = 24 * 60 * 60 * 1000;

let overlay: BrowserWindow | null = null;
let shot: CircleCapture & { chatId?: string } | null = null;
let mainWasVisible = false;
let getMain = getWindow;
const sendToRenderer = (channel: string, ask: CircleAsk) => getMain()?.webContents.send(channel, ask);
let selectedChatId: string | undefined;
let selectedChatTitle = '';
let context: CircleContext | null = null;
let opening = false;
const tutorHandoff = new CircleHandoff();
export const takeCircleTutorCapture = (id: string, chatId: string) => tutorHandoff.take(id, chatId);
let beforeCapture = () => {};
export const setCircleCaptureCleanup = (callback: () => void) => { beforeCapture = callback; };

export async function captureDisplay(display: Electron.Display): Promise<NativeImage> {
  const { width, height } = display.size;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * display.scaleFactor), height: Math.round(height * display.scaleFactor) },
  });
  const source = sources.find(s => s.display_id === String(display.id));
  if (!source) throw new Error('No screen available to capture');
  return source.thumbnail;
}

function restoreMain(focus: boolean) {
  const main = getMain();
  if (!main) return;
  if (focus || mainWasVisible) {
    main.show();
    if (focus) main.focus();
  }
}

function closeOverlay() {
  overlay?.close();
  overlay = null;
  shot = null;
  getMain()?.setAlwaysOnTop(true, 'floating');
}

function pruneOldCaptures() {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  for (const name of fs.readdirSync(CAPTURE_DIR)) {
    const file = path.join(CAPTURE_DIR, name);
    try {
      if (Date.now() - fs.statSync(file).mtimeMs > MAX_CAPTURE_AGE_MS) fs.rmSync(file, { force: true });
    } catch { /* raced with another cleanup */ }
  }
}

/** Open the circle overlay on the display under the cursor. */
export async function startCircle(): Promise<void> {
  if (overlay || opening) return;
  opening = true;
  try {
    beforeCapture();
    tutorHandoff.clear();
    const chatId = selectedChatId;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

    // Keep Ally itself out of the screenshot
    const main = getMain();
    mainWasVisible = !!main?.isVisible();
    const bounds = main?.getBounds();
    context = { title: selectedChatTitle || 'Current chat', hasChat: !!chatId, display: { width: display.bounds.width, height: display.bounds.height },
      anchor: bounds ? { x: bounds.x - display.bounds.x, y: bounds.y - display.bounds.y, width: bounds.width, height: bounds.height } : undefined };
    if (mainWasVisible) {
      main!.hide();
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    try {
      shot = { image: await captureDisplay(display), display, capturedAt: Date.now(), chatId };
    } catch (error) {
      console.error('Circle capture failed:', error);
      restoreMain(false);
      return;
    }

    const { x, y, width, height } = display.bounds;
    overlay = new BrowserWindow({
      x, y, width, height,
      frame: false,
      transparent: false,
      backgroundColor: '#000000',
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    overlay.webContents.on('will-navigate', event => event.preventDefault());
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setBounds(display.bounds); // undo any DPI-driven size drift
    overlay.on('closed', () => {
      overlay = null;
    });
    overlay.on('blur', () => {
      // The real pill stays usable while selecting; unrelated app switches cancel.
      setTimeout(() => { if (overlay && BrowserWindow.getFocusedWindow() !== getMain()) { closeOverlay(); restoreMain(false); } }, 0);
    });
    overlay.once('ready-to-show', () => {
      overlay?.show();
      overlay?.focus();
      main?.setAlwaysOnTop(true, 'screen-saver'); main?.showInactive(); main?.moveTop();
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      await overlay.loadURL(new URL('circle.html', process.env.VITE_DEV_SERVER_URL).toString());
    } else {
      await overlay.loadFile(path.join(__dirname, '../../renderer/circle.html'));
    }
  } catch (error) { closeOverlay(); restoreMain(false); throw error; }
  finally { opening = false; }
}

export function registerCircleIpc(mainWindow = getWindow): void {
  getMain = mainWindow;
  pruneOldCaptures();

  const fromOverlay = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== overlay?.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Use the Ally selection surface.');
  };
  ipcMain.handle('circle:start', event => {
    if (event.sender !== getMain()?.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Start selection from Ally.');
    return startCircle();
  });
  ipcMain.handle('circle:chat', (event, id?: string, title?: string) => {
    if (event.sender !== getMain()?.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Choose the Circle chat in Ally.');
    if (id != null && (typeof id !== 'string' || !id || id.length > 240)) throw Error('Invalid chat.');
    selectedChatId = id;
    selectedChatTitle = typeof title === 'string' ? title.slice(0, 240) : '';
  });

  ipcMain.handle('circle:getShot', event => { fromOverlay(event); return shot ? shot.image.toDataURL() : null; });
  ipcMain.handle('circle:context', event => { fromOverlay(event); return context; });

  ipcMain.handle('circle:cancel', event => {
    fromOverlay(event);
    closeOverlay();
    restoreMain(true);
  });

  ipcMain.handle('circle:submit', async (event, payload: CircleSubmit) => {
    if (event.sender !== overlay?.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Submit the selection from Circle.');
    if (!shot) return;
    if (!payload || typeof payload.prompt !== 'string' || payload.prompt.length > 8000 || (payload.mode != null && payload.mode !== 'draw') || (payload.attachOnly != null && typeof payload.attachOnly !== 'boolean')) throw Error('Invalid Circle request.');
    const { display, chatId } = shot;
    const rect = payload.rect ? circleRegion(payload.rect, display.bounds) : undefined;
    if (!chatId || chatId !== selectedChatId) throw Error('Choose a chat in Ally, then select the area again.');
    // Every selection grants the current agent the same finite drawing capability.
    // Its exact frozen crop is consumed once; no separate drawing capture or mode.
    const tutorCaptureId = tutorHandoff.issue(chatId, { ...shot, rect });
    closeOverlay(); restoreMain(true);
    sendToRenderer('circle:ask', { imagePath: '', thumbnail: '', prompt: payload.prompt, chatId, tutorCaptureId, ...(payload.attachOnly ? { attachOnly: true } : {}) } satisfies CircleAsk);
  });

  app.on('will-quit', () => { closeOverlay(); tutorHandoff.clear(); });
}
