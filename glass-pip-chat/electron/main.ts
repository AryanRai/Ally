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

  // Get current position and size
  const [x, y] = win.getPosition();
  const [currentWidth, currentHeight] = win.getSize();

  console.log('Current window size:', currentWidth, 'x', currentHeight);

  // Ensure dimensions are within bounds
  const constrainedWidth = Math.max(320, Math.min(800, width));
  const constrainedHeight = Math.max(64, Math.min(1000, height));

  // Only resize if dimensions actually changed
  if (currentWidth !== constrainedWidth || currentHeight !== constrainedHeight) {
    // Check if the new size would go off-screen and adjust position if needed
    const { x: newX, y: newY } = ensureWindowOnScreen(x, y, constrainedWidth, constrainedHeight);
    
    // Set new size with animation
    win.setSize(constrainedWidth, constrainedHeight, true);

    // Set position (may be adjusted to keep window on screen)
    win.setPosition(newX, newY);

    console.log('Window resized to:', constrainedWidth, 'x', constrainedHeight, 'at position:', newX, 'x', newY);

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

ipcMain.handle('ollama:streamChatWithThinking', async (event, messages: ChatMessage[], model: string) => {
  try {
    return await ollamaService.streamChatWithThinking(messages, model, (chunk) => {
      // Send progress updates back to renderer
      event.sender.send('ollama:streamProgress', chunk);
    });
  } catch (error) {
    console.error('Error in Ollama streamChatWithThinking:', error);
    throw error;
  }
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

  // Register global shortcut for show/hide
  const shortcut = 'CommandOrControl+Shift+C';
  const registered = globalShortcut.register(shortcut, () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
      // Auto focus on main input when showing
      win.webContents.send('focus-main-input');
    }
  });

  if (!registered) {
    console.error('Failed to register global shortcut');
  }

  // Register quick access shortcut for collapsed mode
  const quickShortcut = 'CommandOrControl+Shift+Q';
  const quickRegistered = globalShortcut.register(quickShortcut, () => {
    if (!win) return;
    if (win.isVisible()) {
      // If visible, just focus quick input
      win.webContents.send('focus-quick-input');
    } else {
      // If hidden, show in collapsed mode and focus quick input
      win.show();
      win.focus();
      win.webContents.send('show-collapsed-and-focus-quick');
    }
  });

  if (!quickRegistered) {
    console.error('Failed to register quick access shortcut');
  }

  // Register maximize/minimize (collapse/expand) shortcut
  const maximizeShortcut = 'CommandOrControl+Shift+M';
  const maximizeRegistered = globalShortcut.register(maximizeShortcut, () => {
    if (!win) return;
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
    // Toggle collapse state
    win.webContents.send('toggle-collapse');
  });

  if (!maximizeRegistered) {
    console.error('Failed to register maximize/minimize shortcut');
  }

  // Register size change shortcut
  const sizeShortcut = 'CommandOrControl+Shift+S';
  const sizeRegistered = globalShortcut.register(sizeShortcut, () => {
    if (!win) return;
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
    // Cycle through sizes
    win.webContents.send('cycle-size');
  });

  if (!sizeRegistered) {
    console.error('Failed to register size change shortcut');
  }

  // Register context toggle shortcut
  const contextShortcut = 'CommandOrControl+Shift+T';
  const contextRegistered = globalShortcut.register(contextShortcut, () => {
    if (!win) return;
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
    // Toggle context monitoring
    win.webContents.send('toggle-context');
  });

  if (!contextRegistered) {
    console.error('Failed to register context toggle shortcut');
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