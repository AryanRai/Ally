import type { CircleRect } from '../../electron/capture/types';
export interface Point { x: number; y: number }
export type SelectionTool = 'freehand' | 'rectangle';

export function selectionBounds(points: Point[], tool: SelectionTool, width: number, height: number): CircleRect | null {
  if (points.length < 2) return null;
  const samples = tool === 'rectangle' ? [points[0], points[points.length - 1]] : points;
  const xs = samples.map(p => p.x), ys = samples.map(p => p.y);
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
  if (right - left < 16 || bottom - top < 16) return null;
  const padding = tool === 'freehand' ? 10 : 0;
  const x = Math.max(0, left - padding), y = Math.max(0, top - padding);
  return { x, y, width: Math.min(width, right + padding) - x, height: Math.min(height, bottom + padding) - y };
}

/** Clamp controls to this display, including when Ally lives on another monitor. */
export function selectionPanel(view: { width: number; height: number }, anchor?: CircleRect, selection?: CircleRect | null, height = 110) {
  const width = Math.min(400, Math.max(0, view.width - 24));
  const clamp = (value: number, max: number) => Math.max(12, Math.min(value, max));
  const onDisplay = anchor && anchor.x < view.width && anchor.x + anchor.width > 0 && anchor.y < view.height && anchor.y + anchor.height > 0;
  const x = selection?.x ?? (onDisplay ? anchor.x : (view.width - width) / 2);
  const y = selection ? (selection.y + selection.height + height + 24 <= view.height ? selection.y + selection.height + 12 : selection.y - height - 12) : onDisplay ? anchor.y : 24;
  return { left: clamp(x, view.width - width - 12), top: clamp(y, view.height - height - 12), width };
}
