// Foreground window + OCR on each OS, behind one interface.
// Windows: the PowerShell helper (Windows.Media.Ocr). Linux: xdotool/xprop +
// tesseract. macOS: osascript + tesseract. Missing tools mean "unavailable",
// reported in diagnostics, never a crash.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WinHelper, type ForegroundWindow } from './winHelper.js';

const run = promisify(execFile);

export interface PlatformHelper {
  /** Starts the helper and reports whether OCR is usable */
  start(): Promise<{ ocr: boolean }>;
  foreground(): Promise<ForegroundWindow>;
  ocr(imagePath: string): Promise<string>;
  stop(): void;
}

async function has(cmd: string): Promise<boolean> {
  try {
    await run(process.platform === 'win32' ? 'where' : 'which', [cmd], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Tesseract OCR (Linux/macOS): `tesseract <image> stdout`. */
async function tesseract(imagePath: string): Promise<string> {
  const { stdout } = await run('tesseract', [imagePath, 'stdout', '--psm', '3'], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

class LinuxHelper implements PlatformHelper {
  private canOcr = false;
  private canWindow = false;

  async start() {
    [this.canOcr, this.canWindow] = await Promise.all([has('tesseract'), has('xdotool')]);
    return { ocr: this.canOcr };
  }

  async foreground(): Promise<ForegroundWindow> {
    if (!this.canWindow) return { title: '', app: '' }; // Wayland or xdotool missing
    const { stdout: id } = await run('xdotool', ['getactivewindow'], { timeout: 2000 });
    const { stdout: title } = await run('xdotool', ['getwindowname', id.trim()], { timeout: 2000 });
    let app = '';
    try {
      const { stdout } = await run('xprop', ['-id', id.trim(), 'WM_CLASS'], { timeout: 2000 });
      app = /"([^"]+)"\s*$/.exec(stdout.trim())?.[1] ?? '';
    } catch { /* xprop missing */ }
    return { title: title.trim(), app };
  }

  ocr(imagePath: string) {
    if (!this.canOcr) return Promise.reject(new Error('Install tesseract for screen text (e.g. apt install tesseract-ocr).'));
    return tesseract(imagePath);
  }

  stop() {}
}

class MacHelper implements PlatformHelper {
  private canOcr = false;

  async start() {
    this.canOcr = await has('tesseract');
    return { ocr: this.canOcr };
  }

  async foreground(): Promise<ForegroundWindow> {
    // Needs Accessibility permission for window titles; app name works without it
    const script = [
      'tell application "System Events"',
      '  set p to first application process whose frontmost is true',
      '  set n to name of p',
      '  set t to ""',
      '  try',
      '    set t to name of front window of p',
      '  end try',
      'end tell',
      'return n & "\\n" & t',
    ].join('\n');
    const { stdout } = await run('osascript', ['-e', script], { timeout: 3000 });
    const [app = '', title = ''] = stdout.trim().split('\n');
    return { app, title };
  }

  ocr(imagePath: string) {
    if (!this.canOcr) return Promise.reject(new Error('Install tesseract for screen text (brew install tesseract).'));
    return tesseract(imagePath);
  }

  stop() {}
}

export function createPlatformHelper(): PlatformHelper | null {
  if (WinHelper.supported()) return new WinHelper();
  if (process.platform === 'linux') return new LinuxHelper();
  if (process.platform === 'darwin') return new MacHelper();
  return null;
}
