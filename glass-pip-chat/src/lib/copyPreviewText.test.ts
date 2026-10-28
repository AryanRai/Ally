import {afterEach,expect,it,vi} from 'vitest';
import {copyPreviewText} from './copyPreviewText';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML='';});
it('copies using the clipboard API when available',async()=>{
 const writeText=vi.fn(async()=>{});vi.stubGlobal('navigator',{clipboard:{writeText}});
 await copyPreviewText('Full reply');expect(writeText).toHaveBeenCalledWith('Full reply');
});
it('falls back to native copy and restores focus and selection when WebView denies clipboard',async()=>{
 const writeText=vi.fn(async()=>{throw Error('denied');});vi.stubGlobal('navigator',{clipboard:{writeText}});
 const input=document.createElement('button'),text=document.createElement('p');text.textContent='Selected text';document.body.append(input,text);input.focus();
 const range=document.createRange();range.setStart(text.firstChild!,0);range.setEnd(text.firstChild!,13);window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range);
 const command=vi.fn((name:string)=>{expect(name).toBe('copy');expect((document.activeElement as HTMLTextAreaElement).value).toBe('Full answer');return true;});
 Object.defineProperty(document,'execCommand',{value:command,configurable:true});
 await copyPreviewText('Full answer');expect(command).toHaveBeenCalledOnce();expect(document.activeElement).toBe(input);expect(window.getSelection()!.toString()).toBe('Selected text');expect(document.querySelector('textarea')).toBeNull();
});
