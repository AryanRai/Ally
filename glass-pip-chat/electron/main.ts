import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
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
    minWidth: 320,
    minHeight: 64,
    maxWidth: 800,
    maxHeight: 1000,
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
    } : {}),
    ...(process.platform === 'win32' ? {
      backgroundMaterial: 'acrylic' as const,
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

// Window resizing handlers
ipcMain.on('window:resize', (_, { width, height }) => {
  console.log('Received resize request:', width, 'x', height);
  if (!win) return;

  // Get current position
  const [x, y] = win.getPosition();
  const [currentWidth, currentHeight] = win.getSize();

  console.log('Current window size:', currentWidth, 'x', currentHeight);

  // Ensure dimensions are within bounds
  const constrainedWidth = Math.max(320, Math.min(800, width));
  const constrainedHeight = Math.max(64, Math.min(1000, height));

  // Only resize if dimensions actually changed
  if (currentWidth !== constrainedWidth || currentHeight !== constrainedHeight) {
    // Set new size with animation
    win.setSize(constrainedWidth, constrainedHeight, true);

    // Maintain position (important for PiP behavior)
    win.setPosition(x, y);

    console.log('Window resized to:', constrainedWidth, 'x', constrainedHeight);

    // Verify the resize worked and save bounds
    setTimeout(() => {
      const [newWidth, newHeight] = win!.getSize();
      console.log('Actual window size after resize:', newWidth, 'x', newHeight);
      saveBounds();

      // Notify renderer that resize is complete
      win!.webContents.send('window:resize-complete', { width: newWidth, height: newHeight });
    }, 100);
  } else {
    console.log('No resize needed - dimensions unchanged');
  }
});

ipcMain.handle('window:get-size', () => {
  if (!win) return { width: 400, height: 560 };

  const [width, height] = win.getSize();
  return { width, height };
});

ipcMain.handle('system:get-platform', () => {
  return process.platform;
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