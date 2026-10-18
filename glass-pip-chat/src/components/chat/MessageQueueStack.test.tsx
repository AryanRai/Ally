import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { MessageQueue } from '../../../electron/agent/messageQueue';
import MessageQueueStack from './MessageQueueStack';
afterEach(cleanup);
function setup() {
  const q = new MessageQueue();
  q.enqueue('codex:chat', { id:'one',text:'First queued' }); q.enqueue('codex:chat',{id:'two',text:'Second queued'});
  const change = vi.fn((key, action) => q.change(key, action));
  window.pip.agent={ queue: vi.fn(async key=>q.snapshot(key)),queueChange:change } as unknown as typeof window.pip.agent;
  render(<MessageQueueStack chatId="codex:chat" />); return {q,change};
}
it('edits the actual queue entry and cancels without adding transcript messages', async () => {
  const {q}=setup(); await screen.findByText('First queued');
  fireEvent.click(screen.getAllByText('Edit')[0]); fireEvent.change(screen.getByLabelText('Edit queued message'),{target:{value:'Changed before send'}});
  fireEvent.click(screen.getByText('Save')); await screen.findByText('Changed before send');
  expect(q.snapshot('codex:chat').items[0].text).toBe('Changed before send');
  fireEvent.click(screen.getAllByText('Cancel')[0]); await waitFor(()=>expect(screen.queryByText('Changed before send')).toBeNull());
  expect(q.snapshot('codex:chat').items.map(i=>i.id)).toEqual(['two']);
});
it('drags the stack and offers keyboard reorder with server revision checks', async () => {
  const {q,change}=setup(); await screen.findByText('First queued');
  fireEvent.dragStart(screen.getByLabelText('Drag queued message 2'));
  fireEvent.drop(screen.getByText('First queued').closest('li')!);
  await waitFor(()=>expect(q.snapshot('codex:chat').items.map(i=>i.id)).toEqual(['two','one']));
  expect(change).toHaveBeenLastCalledWith('codex:chat',{action:'reorder',order:['two','one'],revision:2});
  fireEvent.click(screen.getByLabelText('Move message 1 later'));
  await waitFor(()=>expect(q.snapshot('codex:chat').items.map(i=>i.id)).toEqual(['one','two']));
});
it('retains an edited draft and shows a conflict when another device changed the queue', async () => {
  const {q}=setup(); await screen.findByText('First queued');
  fireEvent.click(screen.getAllByText('Edit')[0]); fireEvent.change(screen.getByLabelText('Edit queued message'),{target:{value:'My edit'}});
  q.enqueue('codex:chat',{id:'three',text:'New from watch'});
  fireEvent.click(screen.getByText('Save'));
  expect(await screen.findByRole('alert')).toHaveTextContent('another device');
  expect(screen.getByLabelText('Edit queued message')).toHaveValue('My edit');
  expect(q.snapshot('codex:chat').items[0].text).toBe('First queued');
});
