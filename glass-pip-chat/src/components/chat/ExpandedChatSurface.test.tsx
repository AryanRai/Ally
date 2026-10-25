import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import ExpandedChatSurface from './ExpandedChatSurface';

vi.mock('framer-motion', () => ({ motion: { div: ({ children, initial: _i, animate: _a, transition: _t, ...props }: any) => <div {...props}>{children}</div> } }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('does not construct an unopened transcript, and retains state through hidden parent updates', () => {
  vi.useFakeTimers();
  const renders = vi.fn();
  function Editor({ version, onSave }: { version: string; onSave: (text: string) => void }) {
    renders();
    const [text, setText] = useState('');
    return <><input aria-label="Edit" value={text} onChange={event => setText(event.target.value)} /><button onClick={() => onSave(text)}>Save {version}</button></>;
  }
  const oldSave = vi.fn(), nextSave = vi.fn();
  const view = render(<ExpandedChatSurface collapsed transcript={<Editor version="old" onSave={oldSave} />} />);
  expect(renders).not.toHaveBeenCalled();
  view.rerender(<ExpandedChatSurface collapsed={false} transcript={<Editor version="old" onSave={oldSave} />} />);
  expect(renders).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(35));
  const editor = screen.getByRole('textbox');
  fireEvent.change(editor, { target: { value: 'Unsent inline edit' } });
  const calls = renders.mock.calls.length;
  view.rerender(<ExpandedChatSurface collapsed transcript={<Editor version="new" onSave={nextSave} />} />);
  expect(renders).toHaveBeenCalledTimes(calls);
  act(() => vi.advanceTimersByTime(200));
  expect(editor.isConnected).toBe(true);
  expect(screen.queryByRole('textbox')).toBeNull();
  view.rerender(<ExpandedChatSurface collapsed={false} transcript={<Editor version="new" onSave={nextSave} />} />);
  act(() => vi.advanceTimersByTime(35));
  expect(screen.getByRole('textbox')).toBe(editor);
  expect(editor).toHaveValue('Unsent inline edit');
  fireEvent.click(screen.getByRole('button', { name: 'Save new' }));
  expect(nextSave).toHaveBeenCalledWith('Unsent inline edit');
  expect(oldSave).not.toHaveBeenCalled();
});

it('keeps the full exit fade, suspends hidden effects and cancels stale hiding on reversal', () => {
  vi.useFakeTimers();
  const start = vi.fn(), stop = vi.fn();
  function Observer() { useEffect(() => { start(); return stop; }, []); return <div>Transcript</div>; }
  const renderSurface = (collapsed: boolean, children: ReactNode = <Observer />) => <ExpandedChatSurface collapsed={collapsed} transcript={null}>{children}</ExpandedChatSurface>;
  const view = render(renderSurface(false));
  act(() => vi.advanceTimersByTime(35));
  expect(start).toHaveBeenCalledTimes(1);
  view.rerender(renderSurface(true));
  act(() => vi.advanceTimersByTime(150));
  expect(stop).not.toHaveBeenCalled();
  view.rerender(renderSurface(false));
  act(() => vi.advanceTimersByTime(100));
  expect(stop).not.toHaveBeenCalled();
  expect(screen.getByText('Transcript')).toBeVisible();
  view.rerender(renderSurface(true));
  act(() => vi.advanceTimersByTime(200));
  expect(stop).toHaveBeenCalledTimes(1);
  view.rerender(renderSurface(false));
  expect(start).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Transcript')).toBeVisible();
  view.unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});

it('releases the previous chat cache when the selected chat key changes', () => {
  vi.useFakeTimers();
  const old = <input aria-label="Old chat edit" defaultValue="Unsent" />;
  const view = render(<ExpandedChatSurface key="first" collapsed={false} transcript={old} />);
  act(() => vi.advanceTimersByTime(35));
  const editor = screen.getByRole('textbox');
  view.rerender(<ExpandedChatSurface key="first" collapsed transcript={null} />);
  act(() => vi.advanceTimersByTime(200));
  expect(editor.isConnected).toBe(true);
  view.rerender(<ExpandedChatSurface key="second" collapsed transcript={<div>Second chat</div>} />);
  expect(editor.isConnected).toBe(false);
  expect(screen.queryByText('Second chat')).toBeNull();
  view.rerender(<ExpandedChatSurface key="second" collapsed={false} transcript={<div>Second chat</div>} />);
  act(() => vi.advanceTimersByTime(35));
  expect(screen.getByText('Second chat')).toBeVisible();
});
