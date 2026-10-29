// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {StudyNarration} from './narration';
it('deduplicates synthesis, confines reads to a board and rejects closed results',async()=>{
 let resolve!:(s:string)=>void;
 const synth=vi.fn(()=>new Promise<string>(r=>resolve=r)),store=new StudyNarration(synth);
 const a=store.prepare('board','Weight equals mass times gravity.'),b=store.prepare('board','Weight equals mass times gravity.');
 resolve(Buffer.alloc(100).toString('base64'));const key=await a;expect(await b).toBe(key);expect(synth).toHaveBeenCalledOnce();
 expect(store.read('board',key)).toHaveLength(100);expect(()=>store.read('other',key)).toThrow('Unknown');
 const late=store.prepare('board','Late');store.reset();resolve(Buffer.alloc(100).toString('base64'));await expect(late).rejects.toThrow('closed');expect(()=>store.read('board',key)).toThrow();
});
