import {afterEach,it,expect,vi} from 'vitest';
import {act,render,screen,cleanup} from '@testing-library/react';
import HandoffHalo from './HandoffHalo';
const original=window.pip;
afterEach(()=>{cleanup();Object.defineProperty(window,'pip',{value:original,configurable:true,writable:true});});
it('receives embedded surface feedback without an action and removes its listener on unmount',()=>{
 const off=vi.fn();let receive:(value:any)=>void=()=>{};
 Object.defineProperty(window,'pip',{value:{onHandoff:(cb:any)=>{receive=cb;return off;}},configurable:true});
 const view=render(<HandoffHalo/>);expect(screen.queryByRole('status')).toBeNull();
 act(()=>receive({id:'handoff-123',phase:'holding',progress:.5}));expect(screen.getByRole('status')).toHaveTextContent('Move away to cancel');
 expect(screen.queryByRole('button')).toBeNull();
 act(()=>window.dispatchEvent(new CustomEvent('ally-handoff',{detail:{id:'handoff-123',phase:'accepted'}})));
 expect(screen.getByRole('status')).toHaveTextContent('Added to your conversation');
 act(()=>receive(null));expect(screen.queryByRole('status')).toBeNull();view.unmount();expect(off).toHaveBeenCalledOnce();
});
