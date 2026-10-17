// Adaptive screen observation: watch a tiny thumbnail for meaningful changes,
// and only then take a real snapshot (kept as a file for vision-capable agents)
// and OCR it. Window switches come from the foreground-window helper.
import { desktopCapturer, screen, type NativeImage } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChangeDetector } from './screenHash.js';
import { now } from './timeline.js';
import { OCR_MAX_DIMENSION } from './winHelper.js';
import type { PlatformHelper } from './platformHelper.js';
import type { Observation } from './types.js';

const THUMB = { width: 192, height: 108 };
/** Snapshots use the display's real pixels (OCR needs them), capped for file size. */
const SNAPSHOT_MAX_WIDTH = 2560;
const KEEP_SNAPSHOTS = 40;

export interface ScreenObserverOptions {
  /** Thumbnail poll interval */
  intervalMs?: number;
  /** Display id to watch; primary when unset */
  displayId?: string;
  /** Window titles/apps to ignore (Ally itself) */
  ignore?: (w: { title: string; app: string }) => boolean;
}

export class ScreenObserver {
  private timer: ReturnType<typeof setInterval> | null = null;
  private windowTimer: ReturnType<typeof setInterval> | null = null;
  private detector = new ChangeDetector();
  private busy = false;
  private lastWindow = '';
  private dir = path.join(os.tmpdir(), 'ally-perception', String(Date.now()));
  ocrAvailable: boolean | null = null;

  constructor(
    private emit: (o: Observation) => void,
    private helper: PlatformHelper | null,
    private opts: ScreenObserverOptions = {},
  ) {}

  get running(): boolean {
    return !!this.timer;
  }

  async start(): Promise<void> {
    if (this.timer) return;
    fs.mkdirSync(this.dir, { recursive: true });
    this.detector.reset();
    if (this.helper) {
      try { this.ocrAvailable = (await this.helper.start()).ocr; }
      catch (e) { this.ocrAvailable = false; this.fail('ocr', e); }
      this.windowTimer = setInterval(() => void this.pollWindow(), 1000);
    } else {
      this.ocrAvailable = false;
    }
    this.timer = setInterval(() => void this.pollScreen(), this.opts.intervalMs ?? 1500);
    // A first snapshot so the agent knows what's on screen from the start
    void this.snapshot('manual', 1);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.windowTimer) clearInterval(this.windowTimer);
    this.timer = this.windowTimer = null;
  }

  /** Take a snapshot now (circle-to-ask, explicit questions). */
  async capture(): Promise<Extract<Observation, { kind: 'screen.snapshot' }> | null> {
    return this.snapshot('manual', 1);
  }

  private displayFor() {
    const displays = screen.getAllDisplays();
    return displays.find(d => String(d.id) === this.opts.displayId) ?? screen.getPrimaryDisplay();
  }

  private async grab(width: number, height: number): Promise<NativeImage | null> {
    const display = this.displayFor();
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    const source = sources.find(s => s.display_id === String(display.id)) ?? sources[0];
    return source && !source.thumbnail.isEmpty() ? source.thumbnail : null;
  }

  private async pollScreen(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const thumb = await this.grab(THUMB.width, THUMB.height);
      if (!thumb) return;
      const size = thumb.getSize();
      const change = this.detector.feed(new Uint8Array(thumb.toBitmap()), size.width, size.height);
      if (change != null) {
        this.emit({ ...now(), kind: 'screen.changed', display: String(this.displayFor().id), change, reason: 'content' });
        await this.snapshot('content', change);
      }
    } catch (e) {
      this.fail('screen', e);
    } finally {
      this.busy = false;
    }
  }

  private async pollWindow(): Promise<void> {
    try {
      const w = await this.helper!.foreground();
      if (!w.title && !w.app) return;
      if (this.opts.ignore?.(w)) return;
      const key = `${w.app}\u0000${w.title}`;
      if (key === this.lastWindow) return;
      this.lastWindow = key;
      this.emit({ ...now(), kind: 'screen.window_changed', title: w.title, app: w.app });
    } catch { /* the helper restarts on next use */ }
  }

  private async snapshot(reason: 'content' | 'manual', change: number): Promise<Extract<Observation, { kind: 'screen.snapshot' }> | null> {
    try {
      const display = this.displayFor();
      const ratio = display.size.height / display.size.width;
      const width = Math.round(Math.min(display.size.width * display.scaleFactor, SNAPSHOT_MAX_WIDTH, OCR_MAX_DIMENSION));
      const image = await this.grab(width, Math.round(width * ratio));
      if (!image) return null;
      const file = path.join(this.dir, `screen-${Date.now()}.png`);
      fs.writeFileSync(file, image.toPNG());
      this.prune();
      const size = image.getSize();
      const snap = { ...now(), kind: 'screen.snapshot' as const, display: String(display.id), path: file, width: size.width, height: size.height };
      this.emit(snap);
      if (reason === 'manual' && change === 1) this.detector.reset();
      if (this.helper && this.ocrAvailable) void this.ocr(file);
      return snap;
    } catch (e) {
      this.fail('screen', e);
      return null;
    }
  }

  private async ocr(file: string): Promise<void> {
    try {
      const text = (await this.helper!.ocr(file)).trim();
      if (text) this.emit({ ...now(), kind: 'screen.ocr', snapshot: file, text });
    } catch (e) {
      this.fail('ocr', e);
    }
  }

  private prune(): void {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.png')).sort();
      for (const f of files.slice(0, Math.max(0, files.length - KEEP_SNAPSHOTS))) fs.rmSync(path.join(this.dir, f), { force: true });
    } catch { /* best effort */ }
  }

  /** Delete this session's snapshots. */
  cleanup(): void {
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }

  private fail(component: 'screen' | 'ocr', e: unknown): void {
    this.emit({ ...now(), kind: 'perception.error', component, message: e instanceof Error ? e.message : String(e) });
  }
}
