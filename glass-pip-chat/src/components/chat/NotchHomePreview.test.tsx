import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotchHomePreview from './NotchHomePreview';
import NotchHome from '../../../../ally-study/notch-ui/home';
import CompactMarkdown from './CompactMarkdown';

vi.mock('./CompactMarkdown', () => ({ default: vi.fn(({ children }: { children: React.ReactNode }) => <div>{children}</div>) }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); delete (window as unknown as {__allySurfaceVisible?: boolean}).__allySurfaceVisible; });

describe('compact notch Home', () => {
  it('puts the latest exchange ahead of controls and opens the existing full chat', () => {
    const open = vi.fn(), refresh = vi.fn();
    const { container } = render(<NotchHomePreview title="MECH5720" question="Note this in formula sheet." answer="Added on page 34." working={false} onOpenChat={open} onRefresh={refresh}/>);
    expect(screen.getByText('Added on page 34.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Ready');
    expect(container.querySelector('details')?.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Continue in chat/ }));
    expect(open).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Refresh preview/ }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('refreshes the selected stream, clears a changed chat and uses only read APIs', async () => {
    vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    let selected = 'one';
    const api = vi.fn(async (route: string) => {
      if (route === 'selection') return { selected: { chatId: selected }, ...(selected === 'one' ? { activeTurn: { id: 'turn', chatId: 'one' } } : {}) };
      if (route.startsWith('chats/')) return { chat: { id: selected, title: selected }, messages: [{ role: 'user', text: `Question ${selected}`, timestamp: 1 }], running: selected === 'one' };
      if (route === 'turns/turn') return { id: 'turn', chatId: 'one', status: 'thinking', liveText: '```js\nstep(1); say("Live answer");' };
      throw Error('Unexpected route');
    });
    render(<NotchHome api={api}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('Live answer')).toBeTruthy();
    selected = 'two';
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.queryByText('Live answer')).toBeNull();
    expect(screen.getByText('Question two')).toBeTruthy();
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });

  it('pauses hidden polling and resumes from visibility without changing drafts', async () => {
    vi.useFakeTimers(); const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const api = vi.fn(async () => ({ selected: null }));
    render(<NotchHome api={api}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(api).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(api).toHaveBeenCalledWith('selection');
  });

  it('keeps unchanged streamed Markdown mounted and makes no reads while the native pane is detached', async () => {
    vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const api = vi.fn(async (route: string) => route === 'selection'
      ? { selected: { chatId: 'one' }, activeTurn: { id: 'turn', chatId: 'one' } }
      : route.startsWith('chats/') ? { chat: { id: 'one', title: 'Study' }, messages: [], running: true }
      : { id: 'turn', chatId: 'one', status: 'thinking', liveText: '```js\nstep(1); say("Stable answer");' });
    render(<NotchHome api={api}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const rendered = vi.mocked(CompactMarkdown).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(vi.mocked(CompactMarkdown).mock.calls.length).toBe(rendered);
    const reads = api.mock.calls.length;
    (window as unknown as {__allySurfaceVisible?: boolean}).__allySurfaceVisible = false;
    await act(async () => { window.dispatchEvent(new Event('ally-surface-visibility')); await vi.advanceTimersByTimeAsync(20000); });
    expect(api.mock.calls.length).toBe(reads);
    (window as unknown as {__allySurfaceVisible?: boolean}).__allySurfaceVisible = true;
    await act(async () => { window.dispatchEvent(new Event('ally-surface-visibility')); });
    expect(api.mock.calls.length).toBeGreaterThan(reads);
    expect(screen.getByText('Stable answer')).toBeTruthy();
  });
  it('continues public progress while history stalls, survives reconnects and keeps completed text',async()=>{
    vi.useFakeTimers();vi.spyOn(document,'hidden','get').mockReturnValue(false);
    let historyResolve!:(value:unknown)=>void,finished=false;
    const api=vi.fn(async(route:string)=>{
      if(route==='selection')return {selected:{chatId:'one',title:'Live chat'},activeTurn:{id:'live',chatId:'one'}};
      if(route==='turns/live')return {id:'live',chatId:'one',status:finished?'done':'thinking',transcript:'Current question',reply:finished?{text:'Complete reply.'}:undefined,progress:[{id:'public',text:'Testing the changes.'}],activity:'Using tools'};
      if(route.endsWith('/preview'))return new Promise(resolve=>{historyResolve=resolve;});
      return {};
    });
    render(<NotchHome api={api}/>);await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
    expect(screen.getByText('Testing the changes.')).toBeTruthy();expect(screen.queryByText('Ally is working on your question…')).toBeNull();
    finished=true;await act(async()=>{await vi.advanceTimersByTimeAsync(500);});
    expect(screen.getByText('Complete reply.')).toBeTruthy();
    await act(async()=>historyResolve({chat:{id:'one',title:'Live chat'},messages:[{role:'user',text:'Current question',timestamp:1}],running:false}));
    expect(screen.getByText('Complete reply.')).toBeTruthy();
  });
  it('copies the visible reply and holds selected text stable during a live update',async()=>{
    const writeText=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
    const props={title:'Chat',question:'Question',answer:'First answer',working:true,onOpenChat:vi.fn(),onRefresh:vi.fn()};
    const {rerender}=render(<NotchHomePreview {...props}/>);
    const panel=screen.getByRole('region',{name:'Live chat preview'});fireEvent.pointerDown(panel);
    rerender(<NotchHomePreview {...props} answer="New answer"/>);
    expect(screen.getByText('First answer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Copy preview'}));await act(async()=>{});expect(writeText).toHaveBeenCalledWith('First answer');
    fireEvent.pointerUp(document);expect(screen.getByText('New answer')).toBeTruthy();
  });
  it('keeps the last good preview on reconnect and ignores a late reply from the previous selection',async()=>{
    vi.useFakeTimers();vi.spyOn(document,'hidden','get').mockReturnValue(false);
    let selected='one',failure=false,lateResolve!:(value:unknown)=>void;
    const api=vi.fn(async(route:string)=>{
      if(route==='selection')return {selected:{chatId:selected,title:selected}};
      if(route==='chats/one/preview'){
        if(failure)return new Promise(resolve=>{lateResolve=resolve;});
        return {chat:{id:'one',title:'one'},messages:[{role:'user',text:'Q1',timestamp:1},{role:'assistant',text:'Cached answer',timestamp:2}],running:false};
      }
      if(route==='chats/two/preview')return {chat:{id:'two',title:'two'},messages:[{role:'user',text:'Q2',timestamp:3},{role:'assistant',text:'New selected answer',timestamp:4}],running:false};
      return {};
    });
    render(<NotchHome api={api}/>);await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(screen.getByText('Cached answer')).toBeTruthy();
    failure=true;await act(async()=>{await vi.advanceTimersByTimeAsync(12000);});expect(screen.getByText('Cached answer')).toBeTruthy();
    selected='two';await act(async()=>{await vi.advanceTimersByTimeAsync(2000);});expect(screen.getByText('New selected answer')).toBeTruthy();
    await act(async()=>lateResolve({chat:{id:'one',title:'one'},messages:[{role:'assistant',text:'Stale response',timestamp:5}],running:false}));
    expect(screen.queryByText('Stale response')).toBeNull();expect(screen.getByText('New selected answer')).toBeTruthy();
  });
});
