import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CodexAccountSettings from './CodexAccountSettings';
import type { CodexAccountsSnapshot } from '../../../electron/agent/codexAccounts';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('requires explicit setup and usage checks and does not send model requests', async () => {
  const initial: CodexAccountsSnapshot = { accounts: [{ id: 'default', label: 'Existing Codex login' }, { id: 'second', label: 'Work' }], selected: 'default', status: {} };
  const api = { list: vi.fn(async () => initial), login: vi.fn(async () => ({ ...initial, signingIn: 'second' })), check: vi.fn(async () => initial), select: vi.fn(async () => initial), add: vi.fn(async () => initial), remove: vi.fn(), cancelLogin: vi.fn(async () => initial) };
  const send = vi.fn();
  vi.stubGlobal('pip', { agent: { codexAccounts: api, send } });
  render(<CodexAccountSettings />);
  await screen.findByText('Work');
  expect(api.check).not.toHaveBeenCalled(); expect(api.login).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Sign in…'));
  await waitFor(() => expect(api.login).toHaveBeenCalledWith('second'));
  await screen.findByText(/Complete sign-in/);
  expect(send).not.toHaveBeenCalled(); expect(api.select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancel sign-in')); await waitFor(() => expect(api.cancelLogin).toHaveBeenCalledOnce());
});
