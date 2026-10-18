import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Overlay from './Overlay';
import Marks from './Marks';
import type { TutorBoard } from '../../electron/visualTutor/types';
const board: TutorBoard = { id: 'test-session', chatId: 'chat', displayId: 1, capturedAt: 1000, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, steps: [{ id: 'one', title: 'A visual explanation', explanation: 'These squares represent area.', marks: [{ id: 'box', kind: 'rect', color: 'mint', points: [{ x: 100, y: 200 }, { x: 300, y: 400 }], text: 'a²' }] }], sketches: [], selected: 0, following: true, sketching: false, frozen: false, revision: 1 };
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount(initial = board) {
  let changed: (board: TutorBoard | null) => void = () => {};
  const api = { overlay: vi.fn().mockResolvedValue({ board: initial, screenshot: 'data:image/png;base64,test' }), action: vi.fn().mockResolvedValue(undefined), sketch: vi.fn().mockResolvedValue(undefined), interactive: vi.fn(), onChanged: vi.fn(callback => { changed = callback; return () => {}; }) };
  window.tutor = api;
  await act(async () => { render(<Overlay />); });
  return { api, changed };
}
describe('visual teaching overlay', () => {
  it('drags only the card, keeps mouse capture until release, and clamps it inside the screen', async () => {
    vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 1; });
    vi.stubGlobal('innerWidth', 1000); vi.stubGlobal('innerHeight', 700);
    const { api } = await mount({ ...board, frozen: true });
    const panel = screen.getByRole('region', { name: 'Visual tutor controls' });
    Object.defineProperties(panel, { offsetWidth: { value: 520 }, offsetHeight: { value: 220 } });
    vi.spyOn(panel, 'getBoundingClientRect').mockImplementation(() => {
      const left = parseFloat(panel.style.left) || 200, top = parseFloat(panel.style.top) || 400;
      return { left, top, right: left + 520, bottom: top + 220, width: 520, height: 220 } as DOMRect;
    });
    const handle = screen.getByRole('button', { name: 'Move explanation panel' });
    Object.assign(handle, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    fireEvent.pointerDown(handle, { button: 0, clientX: 300, clientY: 420 });
    fireEvent.pointerLeave(panel);
    expect(api.interactive).toHaveBeenLastCalledWith(true);
    fireEvent.pointerMove(handle, { clientX: 500, clientY: 120 });
    expect(panel).toHaveStyle({ left: '400px', top: '100px', transform: 'none' });
    fireEvent.pointerMove(handle, { clientX: 2000, clientY: 2000 });
    expect(panel).toHaveStyle({ left: '470px', top: '470px' });
    fireEvent.pointerUp(handle, { clientX: 2000, clientY: 2000 });
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(api.interactive).toHaveBeenLastCalledWith(false);
    expect(api.action).not.toHaveBeenCalled(); expect(api.sketch).not.toHaveBeenCalled();
    expect(document.querySelector('.tutor-drawings')).toHaveStyle({ width: '1920px', height: '1080px' });
    expect(screen.getByAltText('Screen snapshot shared with Ally')).toHaveStyle({ width: '1920px', height: '1080px' });
    vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600);
    fireEvent(window, new Event('resize'));
    expect(panel).toHaveStyle({ left: '270px', top: '370px' });
  });
  it('moves with keyboard arrows without navigating the lesson', async () => {
    const { api } = await mount();
    const handle = screen.getByRole('button', { name: 'Move explanation panel' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(screen.getByRole('region', { name: 'Visual tutor controls' })).toHaveStyle({ left: '10px', top: '10px' });
    expect(api.action).not.toHaveBeenCalled();
  });
  it('renders real scene geometry with display scaling and escaped labels', () => {
    const { container } = render(<Marks marks={board.steps[0].marks} width={1920} height={1080} />);
    const rectangle = container.querySelector('rect')!;
    expect(rectangle.getAttribute('x')).toBe('192'); expect(rectangle.getAttribute('y')).toBe('216'); expect(rectangle.getAttribute('width')).toBe('384');
    expect(screen.getByText('a²')).toBeInTheDocument();
  });
  it('keeps screen interaction available and only enables toolbar mouse handling on hover', async () => {
    const { api } = await mount();
    expect(screen.getByText(/Apps remain clickable/)).toBeInTheDocument();
    expect(screen.queryByAltText('Screen snapshot shared with Ally')).not.toBeInTheDocument();
    expect(document.querySelector('.tutor-drawings')).toHaveStyle({ width: '1920px', height: '1080px' });
    const toolbar = screen.getByRole('region', { name: 'Visual tutor controls' });
    fireEvent.pointerEnter(toolbar); expect(api.interactive).toHaveBeenLastCalledWith(true);
    fireEvent.pointerLeave(toolbar); expect(api.interactive).toHaveBeenLastCalledWith(false);
  });
  it('offers explicit freeze, sketch, chat and end controls without opening audio capture', async () => {
    const { api } = await mount();
    for (const [label, action] of [['Freeze snapshot for stable drawings', 'freeze'], ['Sketch a question', 'sketch'], ['Minimise drawing', 'chat']]) {
      fireEvent.click(screen.getByRole('button', { name: label })); expect(api.action).toHaveBeenLastCalledWith('test-session', action);
    }
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(api.action).toHaveBeenLastCalledWith('test-session', 'chat');
    expect(screen.queryByText(board.steps[0].explanation)).not.toBeInTheDocument();
  });
  it('shows snapshot mode and reader-controlled navigation as state changes', async () => {
    const { changed, api } = await mount();
    act(() => changed({ ...board, frozen: true, following: false, steps: [...board.steps, { ...board.steps[0], id: 'two' }] }));
    expect(screen.getByAltText('Screen snapshot shared with Ally')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Latest/ })); expect(api.action).toHaveBeenCalledWith('test-session', 'latest');
  });
  it('does not inject executable label markup', () => {
    const { container } = render(<Marks marks={[{ ...board.steps[0].marks[0], kind: 'text', points: [{ x: 10, y: 10 }], text: '<script>alert(1)</script>' }]} width={800} height={600} />);
    expect(container.querySelector('script')).toBeNull(); expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });
});
