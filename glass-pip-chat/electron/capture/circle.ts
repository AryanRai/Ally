// Circle to Ask: freeze the screen, let the user circle something, hand the crop to the agent.
import { app, BrowserWindow, desktopCapturer, ipcMain, NativeImage, screen } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindow } from '../window.js';
import { CircleHandoff, circlePixels, circleRegion, type CircleCapture } from './circleHandoff.js';
import type { CircleAsk, CircleSubmit } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAPTURE_DIR = path.join(os.tmpdir(), 'ally-captures');
const MAX_CAPTURE_AGE_MS = 24 * 60 * 60 * 1000;

let overlay: BrowserWindow | null = null;
let shot: CircleCapture & { chatId?: string } | null = null;
let mainWasVisible = false;
let getMain = getWindow;
const sendToRenderer = (channel: string, ask: CircleAsk) => getMain()?.webContents.send(channel, ask);
let selectedChatId: string | undefined;
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
  const source = sources.find(s => s.display_id === String(display.id)) ?? sources[0];
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
  if (overlay) return;
  beforeCapture();
  tutorHandoff.clear();
  const chatId = selectedChatId;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

  // Keep Ally itself out of the screenshot
  const main = getMain();
  mainWasVisible = !!main?.isVisible();
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
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setBounds(display.bounds); // undo any DPI-driven size drift
  overlay.on('closed', () => {
    overlay = null;
  });
  overlay.on('blur', () => {
    // Clicking another window (e.g. alt-tab) abandons the selection
    if (overlay) {
      closeOverlay();
      restoreMain(false);
    }
  });
  overlay.once('ready-to-show', () => {
    overlay?.show();
    overlay?.focus();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await overlay.loadURL(new URL('circle.html', process.env.VITE_DEV_SERVER_URL).toString());
  } else {
    await overlay.loadFile(path.join(__dirname, '../../renderer/circle.html'));
  }
}

export function registerCircleIpc(mainWindow = getWindow): void {
  getMain = mainWindow;
  pruneOldCaptures();

  ipcMain.handle('circle:start', () => startCircle());
  ipcMain.handle('circle:chat', (event, id?: string) => {
    if (event.sender !== getMain()?.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Choose the Circle chat in Ally.');
    if (id != null && (typeof id !== 'string' || !id || id.length > 240)) throw Error('Invalid chat.');
    selectedChatId = id;
  });

  ipcMain.handle('circle:getShot', () => (shot ? shot.image.toDataURL() : null));

  ipcMain.handle('circle:cancel', () => {
    closeOverlay();
    restoreMain(false);
  });

  ipcMain.handle('circle:submit', async (event, payload: CircleSubmit) => {
    if (event.sender !== overlay?.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Submit the selection from Circle.');
    if (!shot) return;
    if (!payload || typeof payload.prompt !== 'string' || payload.prompt.length > 8000 || (payload.mode != null && payload.mode !== 'draw')) throw Error('Invalid Circle request.');
    const { image, display, chatId } = shot;
    const rect = payload.rect ? circleRegion(payload.rect, display.bounds) : undefined;
    if (payload.mode === 'draw') {
      if (!chatId || chatId !== selectedChatId) throw Error('Choose a chat in Ally, then circle the area again.');
      const tutorCaptureId = tutorHandoff.issue(chatId, { ...shot, rect });
      closeOverlay(); restoreMain(true);
      sendToRenderer('circle:ask', { imagePath: '', thumbnail: '', prompt: payload.prompt, chatId, tutorCaptureId } satisfies CircleAsk);
      return;
    }
    const full = image.getSize();
    const crop = rect
      ? image.crop(circlePixels(rect, display.bounds, full))
      : image;

    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
    const imagePath = path.join(CAPTURE_DIR, `circle-${Date.now()}.png`);
    fs.writeFileSync(imagePath, crop.toPNG());
    // Thumbnails live in chat history (localStorage), so keep them small
    const small = crop.resize({ width: Math.min(360, crop.getSize().width) });
    const thumbnail = `data:image/jpeg;base64,${small.toJPEG(70).toString('base64')}`;

    closeOverlay();
    restoreMain(true);
    const ask: CircleAsk = { imagePath, thumbnail, prompt: payload.prompt, chatId };
    sendToRenderer('circle:ask', ask);
  });

  app.on('will-quit', () => { closeOverlay(); tutorHandoff.clear(); });
}
