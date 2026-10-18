type Rect = { x: number; y: number; width: number; height: number };
/** Agent placement remains finite, on-screen, and never covers the real pill. */
export function placeCanvas(view: { width: number; height: number }, pill: Rect | undefined, size: { width: number; height: number }, requested: { x: number; y: number; width: number }) {
  const width = Math.max(120, Math.min(view.width - 24, Math.max(240, requested.width / 1000 * view.width)));
  const height = Math.min(size.height, view.height - 24);
  const left = Math.max(12, Math.min(requested.x / 1000 * view.width, view.width - width - 12));
  const top = Math.max(12, Math.min(requested.y / 1000 * view.height, view.height - height - 12));
  const overlaps = pill && left < pill.x + pill.width && left + width > pill.x && top < pill.y + pill.height && top + height > pill.y;
  return { ...(overlaps ? dockCanvas(view, pill, { width, height }) : { left, top, bottom: 'auto', transform: 'none' }), width };
}
/** Prefer either side of the real pill; stack only where there is room. */
export function dockCanvas(view: { width: number; height: number }, pill: Rect, panel: { width: number; height: number }) {
  const gap = 12, w = Math.min(panel.width, view.width - gap * 2), h = Math.min(panel.height, view.height - gap * 2);
  let left: number, top = pill.y;
  if (pill.x + pill.width + gap + w <= view.width - gap) left = pill.x + pill.width + gap;
  else if (pill.x - gap - w >= gap) left = pill.x - gap - w;
  else { left = pill.x; top = pill.y + pill.height + gap + h <= view.height - gap ? pill.y + pill.height + gap : pill.y - h - gap; }
  return { left: Math.max(gap, Math.min(left, view.width - w - gap)), top: Math.max(gap, Math.min(top, view.height - h - gap)), bottom: 'auto', transform: 'none' };
}
