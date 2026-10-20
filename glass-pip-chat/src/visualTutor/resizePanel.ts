export type PanelRect = { left: number; top: number; width: number; height: number };
export const resizeEdges = { n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left', nw: 'top left' } as const;
export type ResizeEdge = keyof typeof resizeEdges;

/** Keep the opposite edge anchored, with usable controls and reachable borders. */
export function resizePanel(rect: PanelRect, edge: ResizeEdge, dx: number, dy: number, view: { width: number; height: number }): PanelRect {
  const gap = 10;
  const minWidth = Math.min(280, view.width - gap * 2), minHeight = Math.min(180, view.height - gap * 2);
  let left = rect.left, right = rect.left + rect.width, top = rect.top, bottom = rect.top + rect.height;
  if (edge.includes('e')) right = Math.max(left + minWidth, Math.min(view.width - gap, right + dx));
  if (edge.includes('w')) left = Math.min(right - minWidth, Math.max(gap, left + dx));
  if (edge.includes('s')) bottom = Math.max(top + minHeight, Math.min(view.height - gap, bottom + dy));
  if (edge.includes('n')) top = Math.min(bottom - minHeight, Math.max(gap, top + dy));
  return { left, top, width: right - left, height: bottom - top };
}
