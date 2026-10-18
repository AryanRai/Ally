import { randomUUID } from 'node:crypto';
import type { Display, NativeImage } from 'electron';
import type { CircleRect } from './types.js';

export interface CircleCapture { image: NativeImage; display: Display; capturedAt: number; rect?: CircleRect }

/** One frozen selection, consumable once by the chat that opened Circle. */
export class CircleHandoff {
  private pending?: { id: string; chatId: string; capture: CircleCapture; expires: number; timer: ReturnType<typeof setTimeout> };
  issue(chatId: string, capture: CircleCapture) {
    this.clear();
    const id = randomUUID(); const timer = setTimeout(() => this.clear(), 60_000); timer.unref?.();
    this.pending = { id, chatId, capture, expires: Date.now() + 60_000, timer };
    return id;
  }
  take(id: string, chatId: string) {
    const pending = this.pending;
    if (!pending || pending.id !== id || pending.chatId !== chatId || pending.expires <= Date.now()) throw Error('This Circle selection expired or belongs to another chat. Circle it again.');
    this.clear(); return pending.capture;
  }
  clear() { if (this.pending) clearTimeout(this.pending.timer); this.pending = undefined; }
}

export function circleRegion(rect: CircleRect, size: { width: number; height: number }): CircleRect {
  if (![rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) throw Error('Circle a valid area first.');
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  const right = Math.min(size.width, rect.x + rect.width), bottom = Math.min(size.height, rect.y + rect.height);
  if (right <= x || bottom <= y) throw Error('That selection is outside the screen.');
  return { x, y, width: right - x, height: bottom - y };
}
export function circlePixels(rect: CircleRect, bounds: { width: number; height: number }, image: { width: number; height: number }): CircleRect {
  const area = circleRegion(rect, bounds);
  const x = Math.min(image.width - 1, Math.round(area.x * image.width / bounds.width));
  const y = Math.min(image.height - 1, Math.round(area.y * image.height / bounds.height));
  return { x, y, width: Math.max(1, Math.min(image.width - x, Math.round(area.width * image.width / bounds.width))), height: Math.max(1, Math.min(image.height - y, Math.round(area.height * image.height / bounds.height))) };
}
