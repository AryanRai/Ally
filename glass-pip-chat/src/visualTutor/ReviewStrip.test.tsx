import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import ReviewStrip from './ReviewStrip';
import type {TutorBoard} from '../../electron/visualTutor/types';
it('selects retained sections and controls the selected player without recreating a lesson',()=>{
 const select=vi.fn(),control=vi.fn(),board:TutorBoard={id:'b',chatId:'c',displayId:1,bounds:{x:0,y:0,width:1280,height:720},capturedAt:0,sketches:[],following:false,sketching:false,frozen:false,revision:1,selected:1,bookmarks:{move:{time:1.2,rate:1}},steps:[{id:'bridge',title:'Bridge',explanation:'Bridge',marks:[]},{id:'move',title:'Move the car',explanation:'Move',marks:[],clip:{jobId:'j',state:'ready'}}]};
 render(<ReviewStrip board={board} select={select} control={control}/>);
 fireEvent.click(screen.getByText('1. Bridge'));expect(select).toHaveBeenCalledWith('bridge');
 fireEvent.click(screen.getByRole('button',{name:'Slower playback'}));expect(control).toHaveBeenCalledWith('rate',.75);
 expect(screen.getByRole('button',{name:'2. Move the car'})).toHaveAttribute('aria-current','step');
 expect(screen.getByLabelText('Saved playback position')).toHaveTextContent('1.2s');
});
