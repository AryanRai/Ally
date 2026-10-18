// The floating PiP window: creation, bounds persistence, theme, tray and window IPC.
import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { boundsPersistence } from './boundsPersistence.js';
import { openLocalDocument } from './localDocument.js';
import { queryScreen } from './capture/queryScreen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set when quitting from the tray, so closing the window really exits instead of hiding
let isQuitting = false;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let resizeCompletion: ReturnType<typeof setTimeout> | undefined;
let manualResizing = false;
let manualCompletion: ReturnType<typeof setTimeout> | undefined;
const BOUNDS_FILE = path.join(app.getPath('userData'), 'window-bounds.json');

let currentTheme: 'light' | 'dark' = 'dark';
const THEME_FILE = path.join(app.getPath('userData'), 'theme.json');

export function getWindow(): BrowserWindow | null {
  return win;
}

export function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

function loadBounds(): WindowBounds | null {
  try {
    const bounds = JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8'));
    return validateBounds(bounds);
  } catch {
    return null;
  }
}

function validateBounds(bounds: WindowBounds): WindowBounds | null {
  if (!bounds) return null;
  
  // Get all displays
  const displays = screen.getAllDisplays();
  
  // Check if the window position is within any display
  const windowRect = {
    x: bounds.x || 0,
    y: bounds.y || 0,
    width: bounds.width,
    height: bounds.height
  };
  
  // Check if window is visible on any display
  const isVisible = displays.some(display => {
    const { x, y, width, height } = display.workArea;
    
    // Window is visible if any part of it overlaps with the display
    return !(windowRect.x >= x + width || 
             windowRect.x + windowRect.width <= x ||
             windowRect.y >= y + height ||
             windowRect.y + windowRect.height <= y);
  });
  
  if (isVisible) {
    return bounds;
  }
  
  // If not visible, return null to use default positioning
  console.log('Window bounds are off-screen, using default position');
  return null;
}

function saveBounds(): void {
  if (!win) return;
  const bounds = win.getBounds();
  fs.writeFileSync(BOUNDS_FILE, JSON.stringify(bounds));
}
const pendingBounds = boundsPersistence(saveBounds);

function loadTheme(): 'light' | 'dark' {
  try {
    const themeData = JSON.parse(fs.readFileSync(THEME_FILE, 'utf8'));
    return themeData.theme || 'dark';
  } catch {
    return 'dark';
  }
}

function saveTheme(theme: 'light' | 'dark'): void {
  fs.writeFileSync(THEME_FILE, JSON.stringify({ theme }));
}

function setupLinuxBlur(window: BrowserWindow): void {
  try {
    // Detect Wayland: on Wayland, xprop-based blur setup is not applicable.
    // backdrop-filter CSS works natively in Chromium on Wayland, so no X11 setup needed.
    const isWayland = !!(process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');
    if (isWayland) {
      console.log('Running on Wayland - CSS backdrop-filter blur will be used');
      return;
    }

    // X11 session: get this window's XID from the native handle
    const nativeWindowHandle = window.getNativeWindowHandle();
    // On X11, the native handle contains the XID as a little-endian 32-bit integer
    const xid = nativeWindowHandle.readUInt32LE(0);
    if (!xid) {
      console.warn('Could not read window XID from native handle');
      return;
    }
    const windowId = '0x' + xid.toString(16);
    console.log(`Setting up X11 blur for window ${windowId}`);

    // KWin (KDE Plasma) blur
    exec(`xprop -id ${windowId} -f _KDE_NET_WM_BLUR_BEHIND_REGION 32c -set _KDE_NET_WM_BLUR_BEHIND_REGION 0`, (kwinError) => {
      if (kwinError) {
        console.log('KWin blur not available, trying other methods...');
      } else {
        console.log('Applied KWin blur effects');
      }
    });

    // Picom blur (used with i3, bspwm, openbox, and some GNOME X11 setups)
    exec(`xprop -id ${windowId} -f _PICOM_BLUR 32c -set _PICOM_BLUR 1`, (picomError) => {
      if (picomError) {
        console.log('Picom blur not available');
      } else {
        console.log('Applied Picom blur effects');
      }
    });

    // Compiz blur (Ubuntu Unity / older GNOME)
    exec(`xprop -id ${windowId} -f _COMPIZ_WM_WINDOW_BLUR 32c -set _COMPIZ_WM_WINDOW_BLUR 1`, (compizError) => {
      if (compizError) {
        console.log('Compiz blur not available');
      } else {
        console.log('Applied Compiz blur effects');
      }
    });

  } catch (error) {
    console.warn('Error setting up Linux blur:', error);
  }
}

export async function createWindow(): Promise<void> {
  const savedBounds = loadBounds();
  currentTheme = loadTheme();

  const w = new BrowserWindow({
    width: savedBounds?.width ?? 400,
    height: savedBounds?.height ?? 560,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 120, // avatar mode is a small floating robot
    minHeight: 64,
    maxWidth: 800,
    maxHeight: 1000,
    frame: false,
    // Windows 11 only rounds the corners of non-transparent windows, and acrylic is
    // applied to the whole window either way, so stay opaque there: the app then
    // fills a natively rounded acrylic window edge to edge
    transparent: process.platform !== 'win32',
    resizable: true, // keeps WS_THICKFRAME, which Windows also needs for rounding
    movable: true,
    roundedCorners: true,
    hasShadow: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    icon: path.join(__dirname, '../assets/allay.png'),
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
      // Remove the maximize/snap affordance, retaining WS_THICKFRAME for manual
      // edge resizing and native rounded corners.
      maximizable: false,
      backgroundMaterial: 'acrylic' as const,
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: false
    } : {}),
    ...(process.platform === 'linux' ? {
      // Linux blur effects using compositor
      show: false, // Don't show immediately to allow blur setup
      skipTaskbar: false,
      type: 'normal'
    } : {})
  });

  win = w;

  // macOS specific settings for always-on-top and visibility
  if (process.platform === 'darwin') {
    w.setAlwaysOnTop(true, 'floating', 1);
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Windows specific settings for acrylic effect
  if (process.platform === 'win32') {
    // Ensure acrylic is properly applied
    w.once('ready-to-show', () => {
      try {
        // Force refresh the acrylic effect
        w.setBackgroundMaterial('acrylic');
      } catch (error) {
        console.warn('Failed to set acrylic background:', error);
        // Fallback to mica if acrylic fails
        try {
          w.setBackgroundMaterial('mica');
        } catch (micaError) {
          console.warn('Failed to set mica background:', micaError);
        }
      }
    });
  }

  // Linux specific settings for blur effects
  if (process.platform === 'linux') {
    w.once('ready-to-show', () => {
      try {
        // Apply Linux blur effects using native window properties
        setupLinuxBlur(w);
        w.show(); // Show window after blur setup
      } catch (error) {
        console.warn('Failed to set Linux blur effects:', error);
        w.show(); // Show window anyway
      }
    });
  } else {
    // For non-Linux platforms, show immediately when ready
    w.once('ready-to-show', () => {
      if (process.platform !== 'linux') {
        w.show();
      }
    });
  }

  // Save window bounds on move and resize
  w.on('resize', pendingBounds.schedule);
  const settleManualResize = () => {
    if (!manualResizing) return;
    if (manualCompletion) clearTimeout(manualCompletion);
    manualCompletion = setTimeout(() => {
      manualCompletion = undefined; manualResizing = false;
      if (w.isDestroyed() || w !== win) return;
      const [width, height] = w.getSize();
      w.webContents.send('window:manual-resize', { width, height });
    }, 150);
  };
  w.on('will-resize', () => { manualResizing = true; settleManualResize(); });
  w.on('resize', settleManualResize);
  w.on('move', pendingBounds.schedule);
  app.once('before-quit', pendingBounds.flush);
  
  // Prevent actual window close, minimize to tray instead
  w.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      w?.hide();
      if (!pendingBounds.flush()) saveBounds();
    }
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    await w.loadURL(process.env.VITE_DEV_SERVER_URL);
    w.webContents.openDevTools({ mode: 'detach' });
  } else {
    await w.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

export function createTray() {
  // Use the allay.png icon for the tray
  const iconPath = path.join(__dirname, '../assets/allay.png');
  let trayIcon = nativeImage.createFromPath(iconPath);
  
  // Resize icon for tray
  const size = process.platform === 'darwin' ? 16 : 32;
  trayIcon = trayIcon.resize({ width: size, height: size });
  
  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Chat',
      click: () => {
        win?.show();
        win?.focus();
      }
    },
    {
      label: 'Toggle',
      click: () => {
        if (win?.isVisible()) {
          win.hide();
        } else {
          win?.show();
          win?.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Reset Position',
      click: () => {
        if (!win) return;
        
        // Get primary display
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
        
        // Get current window size
        const [windowWidth, windowHeight] = win.getSize();
        
        // Center the window on the primary display
        const x = Math.floor((screenWidth - windowWidth) / 2);
        const y = Math.floor((screenHeight - windowHeight) / 2);
        
        win.setPosition(x, y);
        win.show();
        win.focus();
        saveBounds();
        
        console.log(`Window repositioned to center: ${x}, ${y}`);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Glass PiP Chat');
  tray.setContextMenu(contextMenu);
  
  // Click on tray icon toggles window
  tray.on('click', () => {
    if (win?.isVisible()) {
      win.hide();
    } else {
      win?.show();
      win?.focus();
    }
  });
}

function ensureWindowOnScreen(x: number, y: number, width: number, height: number): { x: number, y: number } {
  // Get the display that contains the current position
  const currentDisplay = screen.getDisplayNearestPoint({ x, y });
  const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = currentDisplay.workArea;
  
  let newX = x;
  let newY = y;
  
  // Check if window would extend beyond right edge
  if (x + width > screenX + screenWidth) {
    newX = screenX + screenWidth - width;
  }
  
  // Check if window would extend beyond bottom edge
  if (y + height > screenY + screenHeight) {
    newY = screenY + screenHeight - height;
  }
  
  // Check if window would be beyond left edge
  if (newX < screenX) {
    newX = screenX;
  }
  
  // Check if window would be beyond top edge
  if (newY < screenY) {
    newY = screenY;
  }
  
  // If position was adjusted, log it
  if (newX !== x || newY !== y) {
    console.log(`Adjusted window position from (${x}, ${y}) to (${newX}, ${newY}) to keep on screen`);
  }
  
  return { x: newX, y: newY };
}

export function registerWindowIpc(): void {
  ipcMain.handle('context:query-screen', async event => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Capture must originate from Ally');
    return queryScreen(win);
  });
  ipcMain.handle('document:open', async (event, file: unknown) => {
    if (event.sender !== win?.webContents) throw Error('Unsupported document source');
    await openLocalDocument(file);
  });
  // IPC handlers
  ipcMain.on('pip:show', () => {
    if (win) win.show();
  });

  ipcMain.on('pip:hide', () => {
    pendingBounds.flush();
    if (win) win.hide();
  });

  ipcMain.on('pip:toggle', () => {
    if (!win) return;
    if (win.isVisible()) {
      pendingBounds.flush();
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
    if (!win) return;
    if (manualResizing) return;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    if (resizeCompletion) clearTimeout(resizeCompletion);

    // Get current position and size
    const [x, y] = win.getPosition();
    const [currentWidth, currentHeight] = win.getSize();


    // Ensure dimensions are within bounds
    const constrainedWidth = Math.max(120, Math.min(800, width));
    const constrainedHeight = Math.max(64, Math.min(1000, height));

    // Only resize if dimensions actually changed
    if (currentWidth !== constrainedWidth || currentHeight !== constrainedHeight) {
      // Check if the new size would go off-screen and adjust position if needed
      const { x: newX, y: newY } = ensureWindowOnScreen(x, y, constrainedWidth, constrainedHeight);
      
      // Set new size with animation
      win.setSize(constrainedWidth, constrainedHeight, true);

      // Set position (may be adjusted to keep window on screen)
      if (newX !== x || newY !== y) win.setPosition(newX, newY);

      // Verify the resize worked and save bounds
      const owner = win;
      resizeCompletion = setTimeout(() => {
        resizeCompletion = undefined;
        if (owner.isDestroyed() || owner !== win) return;
        const [newWidth, newHeight] = owner.getSize();
        pendingBounds.schedule();

        // Notify renderer that resize is complete
        owner.webContents.send('window:resize-complete', { width: newWidth, height: newHeight });
      }, 100);
    } else {
      win.webContents.send('window:resize-complete', { width: currentWidth, height: currentHeight });
    }
  });


  ipcMain.handle('window:get-size', () => {
    if (!win) return { width: 400, height: 560 };

    const [width, height] = win.getSize();
    return { width, height };
  });

  ipcMain.handle('window:reset-position', () => {
    if (!win) return false;
    
    // Get primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
    
    // Get current window size
    const [windowWidth, windowHeight] = win.getSize();
    
    // Center the window on the primary display
    const x = Math.floor((screenWidth - windowWidth) / 2);
    const y = Math.floor((screenHeight - windowHeight) / 2);
    
    win.setPosition(x, y);
    saveBounds();
    
    console.log(`Window repositioned to center: ${x}, ${y}`);
    return true;
  });

  ipcMain.handle('system:get-platform', () => {
    return process.platform;
  });


  // Theme handlers
  ipcMain.handle('theme:get', () => {
    return currentTheme;
  });

  ipcMain.on('theme:set', (_, theme: 'light' | 'dark') => {
    currentTheme = theme;
    saveTheme(theme);
    
    // Apply theme to window
    if (win && process.platform === 'win32') {
      // For Windows, we can change the theme by updating the window's appearance
      win.webContents.send('theme:changed', theme);
    }
    
    // On macOS, update vibrancy
    if (win && process.platform === 'darwin') {
      win.setVibrancy(theme === 'dark' ? 'under-window' : 'under-page');
      win.webContents.send('theme:changed', theme);
    }
    
    // On Linux, refresh blur effects for theme change
    if (win && process.platform === 'linux') {
      setupLinuxBlur(win);
      win.webContents.send('theme:changed', theme);
    }
  });

}
