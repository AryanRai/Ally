import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PendingDecisions } from '../../../ally-study/notch-ui/decisions';

afterEach(cleanup);
it('answers the exact notch question through the broker with the selected option and free text', async () => {
  const row={id:'real-request',chatId:'codex:origin-session',title:'Choose route',detail:'Where should this run?',fields:[{id:'route',label:'Destination',required:true,secret:false,freeText:true,options:[{value:'pc',label:'PC'},{value:'phone',label:'Phone'}]}],actions:[{value:'submit',label:'Send answer'},{value:'cancel',label:'Cancel'}]};
  const api=vi.fn(async(route:string,_body?:unknown)=>route==='interactions'?{requests:[row]}:{accepted:true});
  render(<PendingDecisions api={api}/>);
  const submit=await screen.findByRole('button',{name:'Send answer'});
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'phone'}});
  fireEvent.click(submit);
  await waitFor(()=>expect(api).toHaveBeenCalledWith('interactions/real-request/answer',{action:'submit',values:{route:'phone'}}));
  await waitFor(()=>expect(screen.queryByRole('region')).toBeNull());
});
it('does not poll in parallel when native request events arrive during a refresh',async()=>{
  let finish!:(value:unknown)=>void;
  const api=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
  render(<PendingDecisions api={api}/>);
  window.dispatchEvent(new Event('ally-decisions'));window.dispatchEvent(new Event('ally-decisions'));
  expect(api).toHaveBeenCalledTimes(1);
  finish({requests:[]});
  await waitFor(()=>expect(api).toHaveBeenCalledTimes(2));
});
