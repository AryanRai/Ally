import type { TutorBoard } from './types.js';
type Rect = TutorBoard['bounds'];
type Display = { id: number; bounds: Rect };
export interface StudyContext {
  screenshot?: { widthInPixels?: number; heightInPixels?: number };
  selection?: { bounds?: Rect; capturedAt?: number; sourcePixels?: { width: number; height: number }; focus?: TutorBoard['focus'] };
}
const sameBounds = (a: Rect, b: Rect) => ['x','y','width','height'].every(key => a[key as keyof Rect] === b[key as keyof Rect]);
export function studyDisplay<T extends Display>(context: StudyContext, displays: T[], fallback: () => T): T {
  if (!context.selection?.bounds) return fallback(); // Placement only, never capture provenance.
  const display = displays.find(d => sameBounds(d.bounds, context.selection!.bounds!));
  if (!display) throw Error('The selected display changed. Select the area again.');
  return display;
}
/** Only an issued desktop crop carries reusable capture provenance. Native
 * screenshots have dimensions but no monitor origin; let native capture the
 * next text turn instead of relabelling that image with the cursor's monitor. */
export function bindStudyCapture(board: TutorBoard, context: StudyContext, imagePath: string | undefined, displays: Display[], physical: (bounds: Rect) => Rect): string {
  const display = displays.find(d => d.id === board.displayId && sameBounds(d.bounds, board.bounds));
  if (!display) throw Error('The Study display changed. Select the area again.');
  board.screenBounds = { ...physical(display.bounds) };
  if (!context.selection?.bounds) { delete board.focus; return ''; }
  if (!sameBounds(context.selection.bounds, board.bounds)) throw Error('This crop belongs to another display. Select the area again.');
  board.focus = context.selection.focus && { ...context.selection.focus };
  if (context.selection.sourcePixels) board.screenPixels = { ...context.selection.sourcePixels };
  return imagePath || '';
}
