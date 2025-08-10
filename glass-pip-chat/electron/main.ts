import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OllamaService, ChatMessage } from '../src/services/ollamaService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Extend the global app object to include isQuitting property
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
const BOUNDS_FILE = path.join(app.getPath('userData'), 'window-bounds.json');

// Context monitoring
let lastClipboardText = '';
let clipboardMonitorInterval: NodeJS.Timeout | null = null;

// Theme management
let currentTheme: 'light' | 'dark' = 'dark';
const THEME_FILE = path.join(app.getPath('userData'), 'theme.json');

// Ollama service
const ollamaService = new OllamaService();

// Server status (Digital Ocean droplet)
interface ServerStatus {
  ip: string;
  domain: string;
  status: 'online' | 'offline' | 'unknown';
  lastCheck: number;
  uptime?: number;
  load?: number;
}

let serverStatus: ServerStatus = {
  ip: '192.168.1.100', // Placeholder IP
  domain: 'your-droplet.com', // Placeholder domain
  status: 'unknown',
  lastCheck: Date.now()
};

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

async function createWindow(): Promise<void> {
  const savedBounds = loadBounds();
  currentTheme = loadTheme();

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
      titleBarStyle: 'hidden' as const,
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
  
  // Prevent actual window close, minimize to tray instead
  win.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      win?.hide();
      saveBounds();
    }
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function createTray() {
  // Create a default tray icon
  const size = process.platform === 'darwin' ? 16 : 32;
  const trayIcon = nativeImage.createEmpty();
  
  // Create a simple colored icon
  const canvas = trayIcon.resize({ width: size, height: size });
  
  // For now, use the native image API to create a simple icon
  // In production, you would use a proper icon file
  tray = new Tray(canvas);
  
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
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
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

// Context monitoring functions
function startClipboardMonitoring() {
  if (clipboardMonitorInterval) return;
  
  lastClipboardText = clipboard.readText();
  
  clipboardMonitorInterval = setInterval(() => {
    const currentText = clipboard.readText();
    if (currentText !== lastClipboardText && currentText.trim()) {
      lastClipboardText = currentText;
      
      // Send clipboard update to renderer
      if (win && !win.isDestroyed()) {
        win.webContents.send('context:clipboard-changed', {
          text: currentText,
          timestamp: Date.now()
        });
      }
    }
  }, 500); // Check every 500ms
}

function stopClipboardMonitoring() {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = null;
  }
}

// Context API handlers
ipcMain.handle('context:get-clipboard', () => {
  return clipboard.readText();
});

ipcMain.handle('context:get-selected-text', async () => {
  // This is a simplified approach - in a real implementation you might need
  // platform-specific solutions for getting selected text from other apps
  try {
    // Store current clipboard
    const originalClipboard = clipboard.readText();
    
    // Simulate Ctrl+C to copy selected text (if any)
    // Note: This is a basic approach and might not work in all scenarios
    const { globalShortcut } = require('electron');
    
    // For now, return the current clipboard as selected text
    // In a production app, you'd want more sophisticated selection detection
    return clipboard.readText();
  } catch (error) {
    console.error('Error getting selected text:', error);
    return '';
  }
});

ipcMain.on('context:start-monitoring', () => {
  startClipboardMonitoring();
});

ipcMain.on('context:stop-monitoring', () => {
  stopClipboardMonitoring();
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
});

// Ollama API handlers
ipcMain.handle('ollama:isAvailable', async () => {
  try {
    return await ollamaService.isAvailable();
  } catch (error) {
    console.error('Error checking Ollama availability:', error);
    return false;
  }
});

ipcMain.handle('ollama:getModels', async () => {
  try {
    return await ollamaService.getModels();
  } catch (error) {
    console.error('Error getting Ollama models:', error);
    return [];
  }
});

ipcMain.handle('ollama:chat', async (_, messages: ChatMessage[], model?: string) => {
  try {
    return await ollamaService.chat(messages, model);
  } catch (error) {
    console.error('Error in Ollama chat:', error);
    throw error;
  }
});

ipcMain.handle('ollama:getConfig', () => {
  return ollamaService.getConfig();
});

ipcMain.on('ollama:updateConfig', (_, config) => {
  ollamaService.updateConfig(config);
});

// Server status handlers
ipcMain.handle('server:getStatus', () => {
  return serverStatus;
});

ipcMain.handle('server:checkStatus', async () => {
  try {
    // Simulate server status check - replace with actual implementation
    const isOnline = Math.random() > 0.1; // 90% uptime simulation
    
    serverStatus = {
      ...serverStatus,
      status: isOnline ? 'online' : 'offline',
      lastCheck: Date.now(),
      uptime: isOnline ? Math.floor(Math.random() * 86400) : undefined,
      load: isOnline ? Math.random() * 100 : undefined
    };
    
    return serverStatus;
  } catch (error) {
    console.error('Error checking server status:', error);
    serverStatus.status = 'unknown';
    serverStatus.lastCheck = Date.now();
    return serverStatus;
  }
});

ipcMain.on('server:updateConfig', (_, config: Partial<ServerStatus>) => {
  serverStatus = { ...serverStatus, ...config };
});

// Command execution handler
ipcMain.handle('system:executeCommand', async (_, command: string) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const result = await execAsync(command);
    return {
      success: true,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error: any) {
    console.error('Command execution failed:', error);
    return {
      success: false,
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
});

// App event handlers
app.whenReady().then(async () => {
  await createWindow();
  createTray(); // Create tray after window is ready

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
  // Cleanup
  stopClipboardMonitoring();
  globalShortcut.unregisterAll();
});