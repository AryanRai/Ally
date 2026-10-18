import { describe, expect, it } from 'vitest';
import { LIMITS, parseStep, TutorModel, tutorPrompt } from './model';
import type { TutorBoard, TutorStep } from './types';
export const board = (): TutorBoard => ({ id: 'session-1', chatId: 'chat-1', displayId: 1, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, capturedAt: 1000, steps: [], sketches: [], selected: 0, following: true, sketching: false, frozen: false, revision: 0 });
export const step = (id = 'one'): TutorStep => ({ id, title: 'The triangle', explanation: 'Look at the square on each side.', marks: [{ id: 'side-a', kind: 'arrow', color: 'mint', points: [{ x: 100, y: 200 }, { x: 300, y: 450 }], text: 'Side A' }] });
const started = () => { const model = new TutorModel(); model.start(board()); return model; };

describe('visual tutor scene boundary', () => {
  it('accepts bounded complex diagrams separately from plain annotation text and revokes them with the board', () => {
    const model = started();
    expect(model.draw('session-1', { ...step(), diagram: { html: '<svg><circle r="4"/></svg><input type="range">', height: 300 } }).steps[0].diagram?.height).toBe(300);
    expect(() => model.draw('session-1', { ...step(), diagram: { html: 'x'.repeat(160001) } })).toThrow();
    expect(() => model.draw('session-1', { ...step(), diagram: { html: '<svg/>', height: 999 } })).toThrow();
    model.end('session-1'); expect(() => model.draw('session-1', step())).toThrow();
  });
  it('accepts the typed screen-relative drawing primitives', () => {
    for (const kind of ['arrow', 'line', 'rect', 'ellipse', 'polyline', 'text'] as const) {
      const scene = step(); scene.marks[0].kind = kind;
      if (kind === 'text') scene.marks[0].points = [{ x: 20, y: 30 }];
      expect(parseStep(scene).marks[0].kind).toBe(kind);
    }
  });
  it('rejects invalid coordinates, executable formats and malformed labels before mutating', () => {
    const model = started();
    for (const patch of [{ points: [{ x: -1, y: 1 }, { x: 1, y: 1 }] }, { points: [{ x: Infinity, y: 1 }, { x: 1, y: 1 }] }, { kind: 'svg' }, { color: 'url(https://example.com/)' }, { text: 'x'.repeat(241) }, { points: [] }]) {
      const scene = step(); Object.assign(scene.marks[0], patch);
      expect(() => model.draw('session-1', scene)).toThrow();
      expect(model.get()?.revision).toBe(0);
    }
  });
  it('requires unique mark IDs and correct point counts', () => {
    const scene = step(); scene.marks.push({ ...scene.marks[0] });
    expect(() => parseStep(scene)).toThrow('unique');
    scene.marks = [{ ...scene.marks[0], points: [{ x: 1, y: 1 }] }];
    expect(() => parseStep(scene)).toThrow('two');
  });
  it('bounds steps, marks, polylines and aggregate scene complexity', () => {
    const model = started();
    for (let i = 0; i < LIMITS.steps; i++) model.draw('session-1', step(String(i)));
    expect(() => model.draw('session-1', step('too-many'))).toThrow('16');
    expect(() => model.draw('session-1', { ...step(), marks: Array.from({ length: LIMITS.marks + 1 }, (_, i) => ({ ...step().marks[0], id: String(i) })) })).toThrow('80');
    expect(() => parseStep({ ...step(), marks: [{ ...step().marks[0], kind: 'polyline', points: Array.from({ length: 257 }, () => ({ x: 1, y: 1 })) }] })).toThrow('256');
    expect(() => parseStep({ ...step(), marks: Array.from({ length: 20 }, (_, i) => ({ ...step().marks[0], id: String(i), kind: 'polyline', points: Array.from({ length: 256 }, () => ({ x: 1, y: 1 })) })) })).toThrow('Too many');
  });
});
describe('visual tutor ownership and teaching flow', () => {
  it('requires an explicitly opened session and revokes stale tools after closing or refreshing', () => {
    const model = new TutorModel(); expect(() => model.draw('session-1', step())).toThrow('ended');
    model.start(board()); expect(() => model.draw('another-session', step())).toThrow('ended');
    model.end('session-1'); expect(() => model.draw('session-1', step())).toThrow('ended');
    model.start({ ...board(), id: 'new-session' }); expect(() => model.draw('session-1', step())).toThrow('ended');
  });
  it('updates a step in place, follows new steps, and respects the reader browsing older steps', () => {
    const model = started(); model.draw('session-1', step('one')); model.draw('session-1', step('two'));
    model.draw('session-1', { ...step('two'), title: 'More detail' });
    expect(model.get()?.steps).toHaveLength(2); expect(model.get()?.selected).toBe(1);
    model.select('session-1', 'previous'); model.draw('session-1', step('three'));
    expect(model.get()?.selected).toBe(0); expect(model.get()?.following).toBe(false);
    model.select('session-1', 'latest'); expect(model.get()?.selected).toBe(2); expect(model.get()?.following).toBe(true);
  });
  it('keeps user sketches independent of generated teaching steps, with explicit sketch mode and undo', () => {
    const model = started(); const points = [{ x: 1, y: 2 }, { x: 5, y: 8 }];
    expect(() => model.sketch('session-1', points)).toThrow('off');
    model.toggle('session-1', 'sketching'); model.sketch('session-1', points);
    model.draw('session-1', step()); model.draw('session-1', { ...step(), marks: [] });
    expect(model.get()?.sketches).toHaveLength(1); expect(model.get()?.sketches[0].color).toBe('amber');
    model.undo('session-1'); expect(model.get()?.sketches).toHaveLength(0);
  });
  it('returns detached snapshots and preserves display coordinates including negative monitor origins', () => {
    const model = started(); const snapshot = model.get()!; snapshot.bounds.x = 900; snapshot.steps.push(step());
    expect(model.get()?.bounds.x).toBe(-1920); expect(model.get()?.steps).toHaveLength(0);
  });
  it('describes the screenshot time honestly and reuses the drawing tools instead of a model loop', () => {
    expect(tutorPrompt(board())).toContain('NOT a live screen feed');
    expect(tutorPrompt(board())).toContain('visual_tutor_draw');
  });
});
