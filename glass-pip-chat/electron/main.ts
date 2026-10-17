// Ally main process: a glass PiP overlay in front of Claude Code / Codex.
import { app, BrowserWindow, globalShortcut } from 'electron';
import { createTray, createWindow, getWindow, registerWindowIpc } from './window.js';
import { registerContextIpc, stopClipboardMonitoring } from './ipc/context.js';
import { registerSpeechIpc } from './ipc/speech.js';
import { registerLiveSpeechIpc } from './speech/liveIpc.js';
import { registerReplyNotifications } from './notifications.js';
import { registerPerceptionIpc } from './perception/ipc.js';
import { registerChatsMcp } from './chatsMcp/index.js';
import { registerCursorIpc, stopCursorWatch } from './ipc/cursor.js';
import { registerAgentIpc } from './agent/ipc.js';
import { registerCircleIpc, startCircle } from './capture/circle.js';
import { startShakeDetection, stopShakeDetection } from './capture/shake.js';

/** Global hotkeys: accelerator → renderer event sent after showing the window. */
const SHORTCUTS: Array<{ accelerator: string; event?: string; toggleVisibility?: boolean; run?: () => void }> = [
  { accelerator: 'CommandOrControl+Shift+Space', run: () => void startCircle() },
  { accelerator: 'CommandOrControl+Shift+C', toggleVisibility: true, event: 'focus-main-input' },
  { accelerator: 'CommandOrControl+Shift+Q', event: 'show-collapsed-and-focus-quick' },
  { accelerator: 'CommandOrControl+Shift+M', event: 'toggle-collapse' },
  { accelerator: 'CommandOrControl+Shift+S', event: 'cycle-size' },
  { accelerator: 'CommandOrControl+Shift+T', event: 'toggle-context' },
  { accelerator: 'CommandOrControl+Shift+V', event: 'toggle-speech' },
];

function registerShortcuts(): void {
  for (const { accelerator, event, toggleVisibility, run } of SHORTCUTS) {
    const ok = globalShortcut.register(accelerator, () => {
      if (run) return run();
      const win = getWindow();
      if (!win) return;
      if (toggleVisibility && win.isVisible()) {
        win.hide();
        return;
      }
      if (!win.isVisible()) {
        win.show();
        win.focus();
      }
      if (event) win.webContents.send(event);
    });
    if (!ok) console.error(`Failed to register global shortcut ${accelerator}`);
  }
}

registerWindowIpc();
registerContextIpc();
registerSpeechIpc();
registerLiveSpeechIpc();
registerReplyNotifications();
registerPerceptionIpc(getWindow);
registerChatsMcp(getWindow);
registerCursorIpc();
registerCircleIpc();
registerAgentIpc(getWindow, config => {
  // `screen` (used by the detector) is only available once the app is ready
  void app.whenReady().then(() => {
    if (config.shakeToCircle) startShakeDetection(() => void startCircle());
    else stopShakeDetection();
  });
});

app.whenReady().then(async () => {
  await createWindow();
  createTray();
  registerShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => {
  stopShakeDetection();
  stopCursorWatch();
  stopClipboardMonitoring();
  globalShortcut.unregisterAll();
});
