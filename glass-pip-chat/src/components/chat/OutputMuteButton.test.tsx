import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import OutputMuteButton from './OutputMuteButton';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('shares mute changes across surfaces and exposes an accessible unmute control',async()=>{
 let muted=false;const listeners=new Set<(value:{muted:boolean})=>void>();
 const api={outputMute:async()=>({muted}),setOutputMute:vi.fn(async(value:boolean)=>{muted=value;listeners.forEach(fn=>fn({muted}));return {muted};}),onOutputMute:(fn:(value:{muted:boolean})=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 render(<><OutputMuteButton api={api}/><OutputMuteButton api={api}/></>);
 await waitFor(()=>expect(screen.getAllByRole('button',{name:'Mute Ally'})[0]).not.toBeDisabled());
 fireEvent.click(screen.getAllByRole('button',{name:'Mute Ally'})[0]);
 await waitFor(()=>expect(screen.getAllByRole('button',{name:'Unmute Ally'})).toHaveLength(2));
 expect(api.setOutputMute).toHaveBeenCalledWith(true);
 fireEvent.click(screen.getAllByRole('button',{name:'Unmute Ally'})[1]);
 await waitFor(()=>expect(screen.getAllByRole('button',{name:'Mute Ally'})).toHaveLength(2));
});
it('keeps the saved state if a mute request fails',async()=>{
 render(<OutputMuteButton api={{outputMute:async()=>({muted:false}),setOutputMute:async()=>{throw Error('offline');}}}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Mute Ally'})).not.toBeDisabled());
 fireEvent.click(screen.getByRole('button',{name:'Mute Ally'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Mute Ally'})).toHaveAttribute('title','Could not change Ally audio. Try again.'));
});
