// @vitest-environment node
import {it,expect,vi} from 'vitest';
vi.mock('electron',()=>({app:{},powerMonitor:{}}));
import {AcousticProbe,chirpWave} from './acousticProbe';
it('keeps an opted-in connection enabled beyond fifteen minutes, until Stop',async()=>{
 vi.useFakeTimers();try{
 let now=0;const emit=vi.fn(async()=>{}),send=vi.fn();const p=new AcousticProbe({now:()=>now,unlocked:()=>true,emit});
 await p.message('p','phone',{type:'acoustic_enable',enabled:true},send);now=3600000;
 const m={type:'acoustic_probe',requestId:'12345678-1234-1234-1234-123456789abc'};
 const work=p.message('p','phone',m,send);await vi.advanceTimersByTimeAsync(350);await work;expect(emit).toHaveBeenCalledOnce();
 await p.message('p','phone',{type:'acoustic_enable',enabled:false},send);now+=12000;
 await p.message('p','phone',{...m,requestId:'12345678-1234-1234-1234-123456789abd'},send);expect(emit).toHaveBeenCalledOnce();
 }finally{vi.useRealTimers()}
});
it('cancels a queued chirp on disconnect/lock and never transfers a grant to another device',async()=>{
 vi.useFakeTimers();try{
 const emit=vi.fn(async()=>{}),send=vi.fn();const p=new AcousticProbe({now:()=>0,unlocked:()=>true,emit});
 await p.message('p','phone',{type:'acoustic_enable',enabled:true},send);
 const m={type:'acoustic_probe',requestId:'12345678-1234-1234-1234-123456789abc'};
 await p.message('other','phone',m,send);expect(emit).not.toHaveBeenCalled();
 const work=p.message('p','phone',m,send);p.clear();await vi.advanceTimersByTimeAsync(350);await work;expect(emit).not.toHaveBeenCalled();
 }finally{vi.useRealTimers()}
});
it('generates only a bounded synthetic chirp',()=>{const b=chirpWave([0,1,2,3,3,2,1,0]);expect(b.toString('ascii',0,4)).toBe('RIFF');expect(b.length).toBe(15404);expect(()=>chirpWave([4])).toThrow();});
it('requires a finite opted-in phone session and rejects replay/lock',async()=>{vi.useFakeTimers();let now=1,locked=false;const emit=vi.fn(async()=>{}),send=vi.fn();const p=new AcousticProbe({now:()=>now,unlocked:()=>!locked,emit});const m={type:'acoustic_probe',requestId:'12345678-1234-1234-1234-123456789abc'};await p.message('p','phone',m,send);expect(emit).not.toHaveBeenCalled();await p.message('p','phone',{type:'acoustic_enable',enabled:true},send);const pending=p.message('p','phone',m,send);await vi.advanceTimersByTimeAsync(350);await pending;expect(emit).toHaveBeenCalledOnce();await p.message('p','phone',m,send);locked=true;await p.message('p','phone',{...m,requestId:'12345678-1234-1234-1234-123456789abd'},send);expect(emit).toHaveBeenCalledOnce();now=900001;locked=false;await p.message('p','phone',m,send);expect(emit).toHaveBeenCalledOnce();vi.useRealTimers();});
