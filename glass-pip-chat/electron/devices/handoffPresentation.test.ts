import {it,expect,vi} from 'vitest';
import {HandoffPresentation} from './handoffPresentation';
it('bounds progress, clears lost holds, and does not let another cancelled hold erase active state',()=>{
 vi.useFakeTimers();const p=new HandoffPresentation(),changed=vi.fn();p.subscribe(changed);
 p.publish({id:'hold-1234',phase:'holding',progress:2});expect(p.snapshot()?.progress).toBe(1);
 p.publish({id:'other-123',phase:'cancelled'});expect(p.snapshot()?.id).toBe('hold-1234');
 vi.advanceTimersByTime(1401);expect(p.snapshot()).toBeNull();p.close();vi.useRealTimers();
});
