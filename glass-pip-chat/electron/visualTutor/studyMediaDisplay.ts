import type { TutorBoard } from './types.js';
/** Media placement can follow the cursor; capture/annotation coordinates cannot. */
export function mediaMayMove(board: TutorBoard, stepId: string) {
  const step=board.steps.find(s=>s.id===stepId);
  return !!(step?.clip||step?.diagram)&&!board.frozen&&!board.sketching&&!board.sketches.length&&!step.marks.length;
}
