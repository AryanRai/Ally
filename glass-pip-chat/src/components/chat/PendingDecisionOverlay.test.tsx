import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import PendingDecisionOverlay from './PendingDecisionOverlay';
const original=window.pip;
afterEach(()=>{cleanup();window.pip=original;});
it('shows requests from other chats and clears an answer received on the phone',async()=>{
 let changed!:()=>void;let rows:any[]=[{id:'request',chatId:'codex:other-session',kind:'approval',title:'Allow Outlook?',detail:'Read the requested email',fields:[],actions:[{value:'submitForSession',label:'Allow for this session'}],expiresAt:Date.now()+60000}];
 const answer=vi.fn(async()=>{rows=[];});
 window.pip={agent:{pendingInteractions:async()=>rows,onInteractionsChanged:(callback:any)=>{changed=callback;return()=>{};},answerInteraction:answer}} as any;
 render(<PendingDecisionOverlay/>);
 expect(await screen.findByRole('dialog')).toHaveTextContent('Allow Outlook?');
 await act(async()=>{rows=[];changed();});await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(answer).not.toHaveBeenCalled();
});
it('answers only the specific server-issued request from the visible card',async()=>{
 const row={id:'request',chatId:'codex:other-session',kind:'approval',title:'Allow Outlook?',detail:'Read email',fields:[],actions:[{value:'submitForSession',label:'Allow for this session'}],expiresAt:Date.now()+60000};
 const answer=vi.fn(async()=>({accepted:true}));window.pip={agent:{pendingInteractions:async()=>[row],onInteractionsChanged:()=>()=>{},answerInteraction:answer}} as any;
 render(<PendingDecisionOverlay/>);fireEvent.click(await screen.findByRole('button',{name:'Allow for this session'}));
 await waitFor(()=>expect(answer).toHaveBeenCalledWith('codex:other-session','request',{action:'submitForSession',values:{}}));
});
