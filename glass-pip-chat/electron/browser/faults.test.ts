import {expect,it} from 'vitest';
import {browserFault} from './faults';
it('keeps a stopped debugger turn distinct from the Chrome transport and never authorizes recovery bypass',()=>{
 const fault=browserFault('Browser access stopped for this turn: Chrome detached the debugger (target_closed), three times',true);
 expect(fault).toMatchObject({code:'BROWSER_TURN_STOPPED',chromeConnected:true,retryActionAutomatically:false});
 expect(fault.recovery).toContain('Do not reconnect');
 expect(browserFault('Stale or unknown reference. Take a new snapshot.',true)).toMatchObject({code:'STALE_PAGE_REFERENCE',chromeConnected:true,retryActionAutomatically:false});
 expect(browserFault('Chrome transport disconnected. Outcome may be unknown',false)).toMatchObject({code:'BROWSER_TRANSPORT_OR_TIMEOUT',chromeConnected:false,retryActionAutomatically:false});
});
