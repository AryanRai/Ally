// Clipboard / selected-text context for the "Explain" and "Help" chips.
import { clipboard, ipcMain } from 'electron';
import { sendToRenderer } from '../window.js';

let lastClipboardText = '';
let clipboardMonitorInterval: NodeJS.Timeout | null = null;

function startClipboardMonitoring() {
  if (clipboardMonitorInterval) return;
  
  lastClipboardText = clipboard.readText();
  
  clipboardMonitorInterval = setInterval(() => {
    const currentText = clipboard.readText();
    if (currentText !== lastClipboardText && currentText.trim()) {
      lastClipboardText = currentText;
      
      // Send clipboard update to renderer
      sendToRenderer('context:clipboard-changed', {
          text: currentText,
          timestamp: Date.now()
        });
    }
  }, 500); // Check every 500ms
}

export function stopClipboardMonitoring() {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = null;
  }
}

export function registerContextIpc(): void {
  // Context API handlers
  ipcMain.handle('context:get-clipboard', () => {
    return clipboard.readText();
  });

  // Reading another app's selection needs OS accessibility APIs; the clipboard is the
  // reliable stand-in (copy, then ask)
  ipcMain.handle('context:get-selected-text', () => clipboard.readText());

  ipcMain.on('context:start-monitoring', () => {
    startClipboardMonitoring();
  });

  ipcMain.on('context:stop-monitoring', () => {
    stopClipboardMonitoring();
  });
}
