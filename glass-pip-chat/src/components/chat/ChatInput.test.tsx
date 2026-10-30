import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ChatInput from './ChatInput';

vi.mock('@/lib/look', () => ({ useLook: () => ({ colors: ['#00bfff', '#52e0bb'] }) }));
vi.mock('@/components/glow/AuroraGlow', () => ({ default: () => null }));
vi.mock('@/components/glow/AgentPresence', () => ({ default: () => null }));
vi.mock('./AgentSelectors', () => ({ default: () => null }));
vi.mock('./ComposerTools', () => ({ default: () => null }));
afterEach(cleanup);

it('expanded composer delivers distinct Queue and Steer intents without stopping the active response', async () => {
  const send = vi.fn(), stop = vi.fn();
  render(<ChatInput input="Change the next step" setInput={vi.fn()} onSend={send} isTyping onStop={stop}
    contextData={{ clipboard: '' } as any} onExplainClipboard={vi.fn()}
    voice={{ enabled: false, listening: false, onToggle: vi.fn() }}
    agent={{ label: 'Codex', provider: 'codex', model: 'test', folder: '/work', recentFolders: [], permission: 'full', onPickFolder: vi.fn(), onCyclePermission: vi.fn(), onModel: vi.fn(), onFolder: vi.fn(), onPermission: vi.fn() }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Steer now' }));
  expect(send.mock.calls).toEqual([['steer']]);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Queue' })); });
  expect(send.mock.calls).toEqual([['steer'], ['queue']]);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(send.mock.calls).toEqual([['steer'], ['queue'], ['steer'], ['queue']]);
  expect(stop).not.toHaveBeenCalled();
});
