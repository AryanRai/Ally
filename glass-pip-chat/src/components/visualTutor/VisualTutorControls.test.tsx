import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import VisualTutorControls from './VisualTutorControls';
import type { useVisualTutor } from '@/hooks/useVisualTutor';
afterEach(cleanup);
function setup(active=false,disabled=false) {
  const circle=vi.fn(); Object.defineProperty(window,'pip',{configurable:true,value:{circle:{start:circle}}});
  const tutor: ReturnType<typeof useVisualTutor>={board:active ? {id:'board'} as any : null,busy:false,error:'',start:vi.fn(),decorate:text=>text,show:vi.fn(),end:vi.fn()};
  render(<VisualTutorControls tutor={tutor} disabled={disabled}/>); return {tutor,circle};
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
