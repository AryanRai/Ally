import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CodexAccountControl from './CodexAccountControl';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function api() {
  const send = vi.fn();
  vi.stubGlobal('pip', { agent: { send, codexAccounts: { list: vi.fn(async () => ({ accounts: [{ id: 'default', label: 'Original' }, { id: 'other', label: 'Second' }], selected: 'other', status: {} })) } } });
  return send;
}
it('keeps an existing chat on its original account despite a different default; handoff is explicit and never sends', async () => {
  const send = api(), onChoose = vi.fn();
  render(<CodexAccountControl hasSession disabled={false} onChoose={onChoose} />);
  await screen.findByText('Codex account: Original');
  fireEvent.change(screen.getByLabelText('Codex account for new chat'), { target: { value: 'other' } });
  expect(onChoose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Create handoff chat'));
  expect(onChoose).toHaveBeenCalledWith('other'); expect(send).not.toHaveBeenCalled();
  expect(screen.getByText(/Nothing is replayed or copied automatically/)).toBeTruthy();
});
it('blocks account changes while a turn is active', async () => {
  api(); const onChoose = vi.fn();
  render(<CodexAccountControl hasSession disabled onChoose={onChoose} />);
  const select = await screen.findByLabelText('Codex account for new chat');
  expect(select).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByText('Create handoff chat')); expect(onChoose).not.toHaveBeenCalled();
});
