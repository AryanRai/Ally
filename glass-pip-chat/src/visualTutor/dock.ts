type Rect = { x: number; y: number; width: number; height: number };
/** Prefer either side of the real pill; stack only where there is room. */
export function dockCanvas(view: { width: number; height: number }, pill: Rect, panel: { width: number; height: number }) {
  const gap = 12, w = Math.min(panel.width, view.width - gap * 2), h = Math.min(panel.height, view.height - gap * 2);
  let left: number, top = pill.y;
  if (pill.x + pill.width + gap + w <= view.width - gap) left = pill.x + pill.width + gap;
  else if (pill.x - gap - w >= gap) left = pill.x - gap - w;
  else { left = pill.x; top = pill.y + pill.height + gap + h <= view.height - gap ? pill.y + pill.height + gap : pill.y - h - gap; }
  return { left: Math.max(gap, Math.min(left, view.width - w - gap)), top: Math.max(gap, Math.min(top, view.height - h - gap)), bottom: 'auto', transform: 'none' };
}
