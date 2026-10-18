import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import VisualTutorControls from './VisualTutorControls';
import type { useVisualTutor } from '@/hooks/useVisualTutor';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function setup(active=false,disabled=false) {
  const circle=vi.fn(); Object.defineProperty(window,'pip',{configurable:true,value:{circle:{start:circle}}});
  const tutor: ReturnType<typeof useVisualTutor>={board:active ? {id:'board'} as any : null,busy:false,error:'',start:vi.fn(),decorate:text=>text,show:vi.fn(),showAt:vi.fn(),end:vi.fn(),pendingSelection:false,attach:vi.fn(),claimAttachment:()=>({blocked:false}),action:vi.fn(),hide:vi.fn()};
  const view = render(<VisualTutorControls tutor={tutor} disabled={disabled}/>); return {tutor,circle,...view};
}
it('offers no separate drawing launcher when no lesson is active',()=>{
  const {tutor}=setup(); expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(tutor.start).not.toHaveBeenCalled();
});
it('returns to Circle for a new selection and keeps End available',()=>{
  const {tutor,circle}=setup(true); fireEvent.click(screen.getByRole('button',{name:'Circle another area'})); expect(circle).toHaveBeenCalledOnce(); expect(tutor.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'End drawing explanation'})); expect(tutor.end).toHaveBeenCalledOnce();
});
it('keeps recapture disabled while this chat is working',()=>{
  setup(true,true); expect(screen.getByRole('button',{name:'Circle another area'})).toBeDisabled(); expect(screen.getByRole('button',{name:'End drawing explanation'})).toBeEnabled();
});
it('minimises and reopens the canvas through the pill without ending the board, with live drawing tools', () => {
  const { tutor, rerender } = setup(true);
  Object.assign(tutor.board!, { visible: true, selected: 0, following: false, frozen: true, sketching: false, capturedAt: 1000, sketches: [], steps: [{ id: 'one', title: 'Triangle', explanation: 'Area explained here', marks: [] }, { id: 'two', title: 'Next', explanation: '', marks: [] }] });
  rerender(<VisualTutorControls tutor={tutor} disabled={false} />);
  fireEvent.click(screen.getByTitle('Minimise drawing')); expect(tutor.hide).toHaveBeenCalledOnce(); expect(tutor.end).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Next drawing step' })); expect(tutor.action).toHaveBeenCalledWith('next');
  fireEvent.click(screen.getByRole('button', { name: 'Sketch on drawing' })); expect(tutor.action).toHaveBeenCalledWith('sketch');
  tutor.board!.visible = false;
  rerender(<VisualTutorControls tutor={tutor} disabled={false} />);
  fireEvent.click(screen.getByTitle('View drawings')); expect(tutor.show).toHaveBeenCalledOnce();
  expect(screen.getByText('Area explained here')).toBeInTheDocument();
});
it('keeps compact controls out of the layout and reopens a hidden drawing only after dragging outside the window', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  const { tutor, rerender } = setup(true);
  Object.assign(tutor.board!, { visible: false, steps: [{ id: 'one', title: 'Lens', marks: [], explanation: '' }], sketches: [], selected: 0, capturedAt: 1000 });
  rerender(<VisualTutorControls compact tutor={tutor} disabled={false} />);
  const chip = screen.getByRole('button', { name: 'Drawing controls' });
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(chip);
  expect(screen.getByRole('dialog', { name: 'Drawing tools' })).toHaveClass('fixed');
  fireEvent.keyDown(chip, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull();
  Object.assign(chip, { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() });
  fireEvent.pointerDown(chip, { button: 0, pointerId: 1, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(chip, { pointerId: 1, screenX: 800, screenY: 400 });
  fireEvent.pointerUp(chip, { pointerId: 1, clientX: -200, clientY: 100, screenX: 800, screenY: 400 });
  expect(tutor.showAt).toHaveBeenCalledWith({ x: 800, y: 400 });
  expect(tutor.start).not.toHaveBeenCalled(); expect(tutor.end).not.toHaveBeenCalled();
  fireEvent.pointerDown(chip, { button: 0, pointerId: 2, screenX: 100, screenY: 100 });
  fireEvent.pointerMove(chip, { pointerId: 2, screenX: 800, screenY: 400 });
  fireEvent.pointerCancel(chip, { pointerId: 2 });
  fireEvent.pointerUp(chip, { pointerId: 2, clientX: -100, screenX: 800, screenY: 400 });
  expect(tutor.showAt).toHaveBeenCalledOnce();
});
