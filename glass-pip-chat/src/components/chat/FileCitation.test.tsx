import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import WatchReplyContent from './WatchReplyContent';
afterEach(cleanup);
it.each([true, false])('renders a usable file citation in compact=%s and opens only after a click', async compact => {
  const open = vi.fn().mockResolvedValue(undefined);
  window.pip = { openLocalDocument: open } as any;
  render(<WatchReplyContent compact={compact} content={'Added page 2.\n\n:codex-file-citation{path="C:/study/Formula Sheet.pdf" purpose="output"}'} />);
  const link = await screen.findByRole('link', { name: 'Formula Sheet.pdf' });
  expect(screen.queryByText(/:codex-file-citation/)).not.toBeInTheDocument();
  expect(open).not.toHaveBeenCalled(); fireEvent.click(link);
  await waitFor(() => expect(open).toHaveBeenCalledWith('C:/study/Formula Sheet.pdf'));
  open.mockRejectedValueOnce(Error('missing'));
  fireEvent.click(link); expect(await screen.findByText('File unavailable')).toBeInTheDocument();
});
