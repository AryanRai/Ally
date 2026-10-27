import { useState } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Chat } from '@/types/chat';
import type { SelectionSnapshot } from '../../electron/agent/selection';
import { useSharedChatSelection } from './useSharedChatSelection';

const original = window.pip;
afterEach(() => { cleanup(); window.pip = original; });
const chat = (id: string): Chat => ({ id, title: id, createdAt: 1, updatedAt: 1, messages: [], agent: { provider: 'codex', sessionId: id } });
const selection = (id: string): SelectionSnapshot => ({ version: id, origin: 'notch', selected: { chatId: `codex:${id}`, sessionId: id, provider: 'codex', title: id, permission: 'readonly' } });

it('preserves a manual choice made before the startup read completes', async () => {
  let resolve!: (snapshot: SelectionSnapshot) => void;
  const open = vi.fn(async () => {}), setSelection = vi.fn(async selected => ({accepted:true,version:'new',origin:'desktop' as const,selected}));
  window.pip = {agent:{getSelection:()=>new Promise(r=>{resolve=r;}),setSelection,onSelection:()=>()=>{}}} as any;
  const {rerender} = renderHook(({id,restored})=>useSharedChatSelection(chat(id),restored,'readonly',open),{initialProps:{id:'disk',restored:true}});
  rerender({id:'manual',restored:false});
  await act(async()=>resolve(selection('stale')));
  await waitFor(()=>expect(setSelection).toHaveBeenCalledWith(expect.objectContaining({sessionId:'manual'}),'stale'));
  expect(open).not.toHaveBeenCalled();
});

it('publishes desktop choices and opens notch choices without an echo or an agent send', async () => {
  let state: SelectionSnapshot = { version: 'initial', selected: null, origin: 'desktop' };
  let emit!: (state: SelectionSnapshot) => void;
  const setSelection = vi.fn(async (selected, version) => {
    expect(version).toBe(state.version);
    state = { version: crypto.randomUUID(), selected, origin: 'desktop' }; emit(state);
    return { accepted: true, ...state };
  });
  window.pip = { agent: { getSelection: async () => state, setSelection, onSelection: (cb: typeof emit) => { emit = cb; return () => {}; } } } as any;
  const open = vi.fn();
  const { result } = renderHook(() => {
    const [current, select] = useState(chat('first'));
    const error = useSharedChatSelection(current, current.id === 'first', 'readonly', async session => { open(session); select(chat(session.id)); });
    return { current, select, error };
  });
  await waitFor(() => expect(setSelection).toHaveBeenCalledOnce());
  act(() => { state = selection('second'); emit(state); });
  await waitFor(() => expect(result.current.current.id).toBe('second'));
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'second', provider: 'codex' }));
  expect(setSelection).toHaveBeenCalledOnce();
  act(() => result.current.select(chat('third')));
  await waitFor(() => expect(setSelection).toHaveBeenCalledTimes(2));
  expect(state.selected?.sessionId).toBe('third'); expect(result.current.error).toBe('');
});

it('ignores a stale startup read after a newer notch selection and ignores later history completion', async () => {
  let resolve!: (snapshot: SelectionSnapshot) => void, emit!: (snapshot: SelectionSnapshot) => void;
  const setSelection = vi.fn();
  window.pip = { agent: { getSelection: () => new Promise(r => { resolve = r; }), setSelection, onSelection: (cb: typeof emit) => { emit = cb; return () => {}; } } } as any;
  const open = vi.fn(async (_session: { id: string }) => {});
  renderHook(() => useSharedChatSelection(chat('old'), true, 'readonly', open));
  await act(async () => { emit(selection('new')); resolve({ version: 'old', selected: null, origin: 'desktop' }); });
  expect(open).toHaveBeenCalledOnce(); expect(open.mock.calls[0][0]).toMatchObject({ id: 'new' });
  expect(setSelection).not.toHaveBeenCalled();
});

it('shares an unlinked local chat and adopts its first Study session without opening another chat',async()=>{
  let state:SelectionSnapshot={version:'initial',selected:null,origin:'desktop'},emit!:(snapshot:SelectionSnapshot)=>void;
  const setSelection=vi.fn(async selected=>{state={version:crypto.randomUUID(),selected,origin:'desktop'};emit(state);return {accepted:true,...state};});
  window.pip={agent:{getSelection:async()=>state,setSelection,onSelection:(cb:typeof emit)=>{emit=cb;return()=>{};}}} as any;
  const open=vi.fn(),linked=vi.fn();
  const {result}=renderHook(()=>{
    const [current,setCurrent]=useState<Chat>({...chat('local-draft'),agent:{provider:'codex',cwd:'C:/project'}});
    useSharedChatSelection(current,true,'readonly',open,(id,agent)=>{linked(id,agent);setCurrent(old=>({...old,agent}));});
    return current;
  });
  await waitFor(()=>expect(state.selected).toMatchObject({chatId:'local-draft',provider:'codex',cwd:'C:/project'}));
  expect(state.selected?.sessionId).toBeUndefined();
  act(()=>{state={...state,version:'linked',selected:{...state.selected!,sessionId:'real-first-session'}};emit(state);});
  await waitFor(()=>expect(result.current.agent?.sessionId).toBe('real-first-session'));
  expect(result.current.id).toBe('local-draft');expect(open).not.toHaveBeenCalled();
  expect(linked).toHaveBeenCalledOnce();expect(setSelection).toHaveBeenCalledOnce();
});

it('publishes permission and title changes on the same session and follows external desktop navigation',async()=>{
  let state:SelectionSnapshot={version:'initial',selected:null,origin:'desktop'},emit!:(state:SelectionSnapshot)=>void;
  const setSelection=vi.fn(async selected=>{state={version:crypto.randomUUID(),selected,origin:'desktop'};emit(state);return {accepted:true,...state};});
  window.pip={agent:{getSelection:async()=>state,setSelection,onSelection:(cb:typeof emit)=>{emit=cb;return()=>{};}}} as any;
  const open=vi.fn(async()=>{}),applyPermission=vi.fn();
  const {rerender}=renderHook(({current,permission}:{current:Chat;permission:'readonly'|'full'})=>useSharedChatSelection(current,true,permission,open,undefined,{setPermission:applyPermission}),{initialProps:{current:chat('same'),permission:'readonly' as 'readonly'|'full'}});
  await waitFor(()=>expect(setSelection).toHaveBeenCalledOnce());
  rerender({current:{...chat('same'),title:'Renamed'},permission:'full'});
  await waitFor(()=>expect(state.selected).toMatchObject({sessionId:'same',title:'Renamed',permission:'full'}));
  const calls=setSelection.mock.calls.length;
  act(()=>{state={...selection('external'),origin:'desktop'};emit(state);});
  expect(open).toHaveBeenCalledWith(expect.objectContaining({id:'external'}));
  expect(applyPermission).toHaveBeenCalledWith('readonly');
  expect(setSelection).toHaveBeenCalledTimes(calls);
});

it('selects an unlinked local chat requested by Study without creating a session',async()=>{
  let emit!:(state:SelectionSnapshot)=>void;
  const local=vi.fn(()=>true),open=vi.fn(async()=>{});
  window.pip={agent:{getSelection:async()=>({version:'initial',selected:null,origin:'desktop'}),setSelection:vi.fn(async()=>({accepted:true,version:'published',selected:null,origin:'desktop'})),onSelection:(cb:typeof emit)=>{emit=cb;return()=>{};}}} as any;
  renderHook(()=>useSharedChatSelection(chat('old'),true,'readonly',open,undefined,{selectLocal:local}));
  await act(async()=>{});
  act(()=>emit({version:'new',origin:'notch',selected:{chatId:'local-draft',provider:'codex',title:'Draft',permission:'readonly'}}));
  expect(local).toHaveBeenCalledWith('local-draft');expect(open).not.toHaveBeenCalled();
});

it('publishes the selected account before a native thread exists and updates account-only navigation', async () => {
  const setSelection = vi.fn(async selected => ({ accepted: true, version: crypto.randomUUID(), origin: 'desktop' as const, selected }));
  window.pip = { agent: { getSelection: async () => ({ version: 'initial', selected: null, origin: 'desktop' }), setSelection, onSelection: () => () => {} } } as any;
  const local: Chat = { ...chat('local-empty'), agent: { provider: 'codex', codexAccountId: 'profile-one' } };
  const open = vi.fn();
  const { rerender } = renderHook(({ current }) => useSharedChatSelection(current, false, 'readonly', open), { initialProps: { current: local } });
  await waitFor(() => expect(setSelection).toHaveBeenLastCalledWith(expect.objectContaining({ chatId: 'local-empty', codexAccountId: 'profile-one', sessionId: undefined }), expect.any(String)));
  rerender({ current: { ...local, agent: { provider: 'codex', codexAccountId: 'profile-two' } } });
  await waitFor(() => expect(setSelection).toHaveBeenLastCalledWith(expect.objectContaining({ codexAccountId: 'profile-two' }), expect.any(String)));
  expect(open).not.toHaveBeenCalled();
});
