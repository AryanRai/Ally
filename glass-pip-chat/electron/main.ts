import { app, BrowserWindow, globalShortcut, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let win: BrowserWindow | null = null;
const BOUNDS_FILE = path.join(app.getPath('userData'), 'window-bounds.json');

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

function loadBounds(): WindowBounds | null {
  try {
    return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveBounds(): void {
  if (!win) return;
  const bounds = win.getBounds();
  fs.writeFileSync(BOUNDS_FILE, JSON.stringify(bounds));
}

async function createWindow(): Promise<void> {
  const savedBounds = loadBounds();
  
  win = new BrowserWindow({
    width: savedBounds?.width ?? 400,
    height: savedBounds?.height ?? 560,
    x: savedBounds?.x,
    y: savedBounds?.y,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    roundedCorners: true,
    hasShadow: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(process.platform === 'darwin' ? {
      vibrancy: 'under-window' as const,
      visualEffectState: 'active' as const,
    } : {})
  });

  // macOS specific settings for always-on-top and visibility
  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'floating', 1);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Save window bounds on move and resize
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('close', saveBounds);

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// IPC handlers
ipcMain.on('pip:show', () => {
  if (win) win.show();
});

ipcMain.on('pip:hide', () => {
  if (win) win.hide();
});

ipcMain.on('pip:toggle', () => {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
  }
});

ipcMain.on('pip:minimize', () => {
  if (win) win.minimize();
});

ipcMain.on('pip:close', () => {
  if (win) win.close();
});

// App event handlers
app.whenReady().then(async () => {
  await createWindow();
  
  // Register global shortcut
  const shortcut = 'CommandOrControl+Shift+C';
  const registered = globalShortcut.register(shortcut, () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
      // Notify renderer to focus input
      win.webContents.send('focus-input');
    }
  });

  if (!registered) {
    console.error('Failed to register global shortcut');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});