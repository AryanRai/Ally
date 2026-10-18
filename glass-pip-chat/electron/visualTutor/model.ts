import { TUTOR_COLORS, type TutorBoard, type TutorMark, type TutorPoint, type TutorStep } from './types.js';

export const LIMITS = { steps: 16, marks: 80, points: 256, sketches: 40, totalPoints: 4000 };
const kinds = ['arrow', 'line', 'rect', 'ellipse', 'polyline', 'text'];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number, name: string): string {
  if (typeof value !== 'string' || value.length > max || !value.trim()) throw new Error(`Invalid ${name} (1–${max} characters)`);
  return value;
}
export function parsePoints(value: unknown): TutorPoint[] {
  if (!Array.isArray(value) || !value.length || value.length > LIMITS.points) throw new Error(`Use 1–${LIMITS.points} points`);
  return value.map(item => {
    const p = object(item);
    if (typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1000 || p.y < 0 || p.y > 1000) throw new Error('Coordinates must be finite numbers between 0 and 1000');
    return { x: p.x, y: p.y };
  });
}
export function parseStep(value: unknown): TutorStep {
  const step = object(value);
  if (!Array.isArray(step.marks) || step.marks.length > LIMITS.marks) throw new Error(`At most ${LIMITS.marks} marks per step`);
  const ids = new Set<string>();
  let pointCount = 0;
  const marks = step.marks.map(value => {
    const mark = object(value);
    const id = string(mark.id, 80, 'mark ID');
    if (ids.has(id)) throw new Error('Mark IDs must be unique within a step');
    ids.add(id);
    if (!kinds.includes(mark.kind as string)) throw new Error('Unknown drawing kind');
    if (!TUTOR_COLORS.includes(mark.color as TutorMark['color'])) throw new Error('Unknown drawing color');
    const points = parsePoints(mark.points);
    pointCount += points.length;
    const kind = mark.kind as TutorMark['kind'];
    if ((kind === 'text' && points.length !== 1) || (kind !== 'text' && kind !== 'polyline' && points.length !== 2) || (kind === 'polyline' && points.length < 2)) throw new Error('Text uses one point; lines, arrows, rectangles and ellipses use two; polylines use at least two');
    const text = mark.text === undefined ? undefined : string(mark.text, 240, 'label');
    if (kind === 'text' && !text) throw new Error('Text marks require text');
    return { id, kind, color: mark.color as TutorMark['color'], points, ...(text ? { text } : {}) };
  });
  if (pointCount > LIMITS.totalPoints) throw new Error('Too many drawing points');
  let diagram: TutorStep['diagram'];
  if (step.diagram !== undefined) {
    const input = object(step.diagram);
    const height = input.height ?? 320;
    if (typeof height !== 'number' || !Number.isInteger(height) || height < 120 || height > 600) throw Error('Diagram height must be 120–600 pixels');
    diagram = { html: string(input.html, 160000, 'diagram HTML/SVG'), height };
  }
  return { id: string(step.id, 80, 'step ID'), title: string(step.title, 120, 'step title'), explanation: step.explanation === '' ? '' : string(step.explanation, 1800, 'explanation'), marks, ...(diagram ? { diagram } : {}) };
}

/** All validation happens before mutation; a stale tool can never revive a closed board. */
export class TutorModel {
  private board: TutorBoard | null = null;
  get(): TutorBoard | null { return this.board ? structuredClone(this.board) : null; }
  start(board: TutorBoard): TutorBoard { this.board = structuredClone(board); return this.get()!; }
  require(id: unknown): TutorBoard {
    if (!this.board || this.board.id !== id) throw new Error('This visual tutor session has ended. Ask the user to open Visual tutor again.');
    return this.board;
  }
  draw(id: unknown, input: unknown): TutorBoard {
    const board = this.require(id);
    const step = parseStep(input);
    const index = board.steps.findIndex(s => s.id === step.id);
    if (index < 0 && board.steps.length >= LIMITS.steps) throw new Error(`At most ${LIMITS.steps} steps; update an existing step instead`);
    if (index < 0) board.steps.push(step); else board.steps[index] = step;
    if (board.following) board.selected = board.steps.length - 1;
    board.revision++;
    return this.get()!;
  }
  select(id: string, action: 'previous' | 'next' | 'latest'): TutorBoard {
    const board = this.require(id);
    const last = Math.max(0, board.steps.length - 1);
    board.selected = action === 'latest' ? last : Math.max(0, Math.min(last, board.selected + (action === 'next' ? 1 : -1)));
    board.following = board.selected === last;
    board.revision++;
    return this.get()!;
  }
  toggle(id: string, mode: 'sketching' | 'frozen'): TutorBoard {
    const board = this.require(id); board[mode] = !board[mode]; board.revision++; return this.get()!;
  }
  sketch(id: string, input: unknown): TutorBoard {
    const board = this.require(id);
    if (!board.sketching) throw new Error('Sketch mode is off');
    const points = parsePoints(input);
    if (points.length < 2) throw new Error('A sketch needs at least two points');
    if (board.sketches.length >= LIMITS.sketches) throw new Error('Sketch limit reached. Undo a sketch first.');
    board.sketches.push({ id: `sketch-${board.revision}`, kind: 'polyline', color: 'amber', points });
    board.revision++; return this.get()!;
  }
  undo(id: string): TutorBoard { const board = this.require(id); board.sketches.pop(); board.revision++; return this.get()!; }
  end(id: string): void { this.require(id); this.board = null; }
}

export function tutorPrompt(board: TutorBoard): string {
  return `[Ally visual tutor session ${board.id}. The user explicitly opened a drawing overlay for this chat. A single screenshot was captured at ${new Date(board.capturedAt).toISOString()}; it is NOT a live screen feed. Use the attached image for this lesson. To teach visually, call visual_tutor_draw on the ally_chats MCP server with boardId="${board.id}" and step={id,title,explanation,marks:[{id,kind,color,points:[{x,y}],text?}]}. Draw useful diagrams, arrows or labels, not only prose. Coordinates run 0–1000 across the full display; (0,0) is top left. ${board.focus ? `The attached image contains only the circled crop at ${JSON.stringify(board.focus)} in full-display coordinates. Convert a crop point (u,v), each 0–1000, into screen coordinates with x=focus.x+u*focus.width/1000 and y=focus.y+v*focus.height/1000. Keep the explanation focused on this area.` : "The attached image covers the full display."} Arrow/line/rect/ellipse use two corner/end points, polyline uses 2–256 points, text uses one anchor point. Colors: mint, blue, amber, pink, white. Text marks are plain text. For complex diagrams, include optional step.diagram={html,height:320}: self-contained HTML/SVG/CSS and local JavaScript for sliders, diagrams or simulations, rendered in an isolated sandbox with no network, files, parent access, popups, forms or navigation. No external libraries; inline scripts use addEventListener (inline event attributes are blocked). Use marks:[] for a diagram-only step. Never put HTML inside text marks. Keep labels concise and drawings away from the bottom-center controls. Upsert the same step ID to build it incrementally; use a new ID for the next teaching step. At most 16 steps and 80 marks per step. visual_tutor_read returns current steps and the user's amber sketches. Answer follow-up questions in this same chat; use the read tool to inspect sketches. Never claim to see screen changes without a fresh screenshot. If tools are unavailable, say so; don't pretend drawings were displayed.]`;
}
