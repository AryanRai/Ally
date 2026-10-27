import { expect,it } from 'vitest';
import { mergeProviderPages } from './mergeProviderPages';
const old=[{id:'codex-old',provider:'codex' as const,updatedAt:1},{id:'claude-old',provider:'claude' as const,updatedAt:2}];
const offsets={codex:30,claude:30},expanded={codex:false,claude:false};
it('retains failed-provider chats and cursor while updating the successful provider',()=>{
  const result=mergeProviderPages(old,offsets,expanded,[{status:'fulfilled',value:{chats:[{id:'new',provider:'codex',updatedAt:3}],nextOffset:60}},{status:'rejected',reason:Error('offline')}],false);
  expect(result.chats.map(row=>row.id)).toEqual(['new','claude-old']);
  expect(result.offsets).toEqual({codex:60,claude:30});expect(result.error).toContain('Claude');
});
it('accepts a successful empty provider list without deleting failed or skipped providers',()=>{
  const result=mergeProviderPages(old,offsets,expanded,[{status:'fulfilled',value:{chats:[],nextOffset:null}},{status:'fulfilled',value:undefined}],false);
  expect(result.chats).toEqual([old[1]]);expect(result.offsets).toEqual({codex:null,claude:30});
});
it('keeps loaded older pages and pagination depth on refresh, with newest metadata winning',()=>{
  const result=mergeProviderPages(old,{codex:60,claude:null},{codex:true,claude:false},[{status:'fulfilled',value:{chats:[{...old[0],updatedAt:8},{id:'latest',provider:'codex',updatedAt:9}],nextOffset:30}},{status:'fulfilled',value:{chats:[old[1]],nextOffset:null}}],false);
  expect(result.chats.map(row=>row.id)).toEqual(['latest','codex-old','claude-old']);expect(result.offsets.codex).toBe(60);
});
