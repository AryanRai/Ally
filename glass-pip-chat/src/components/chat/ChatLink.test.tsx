import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ChatLink from './ChatLink';
afterEach(cleanup);
it('loads a visualization only on a deliberate click and isolates it from Ally and the network', async () => {
  const read = vi.fn().mockResolvedValue('<h1>Lens</h1><input type="range"><script>parent.document.body.remove()</script><img src="file:///secret">');
  Object.defineProperty(window, 'pip', { configurable: true, value: { readVisualization: read } });
  render(<ChatLink href="/__ally_visualization__/C%3A%2Fdiagram.html">View diagram</ChatLink>);
  expect(read).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByText('View diagram')));
  expect(read).toHaveBeenCalledWith('C:/diagram.html');
  const frame = screen.getByTitle('Interactive diagram');
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  expect(frame.getAttribute('srcdoc')).toContain("connect-src 'none'");
  expect(frame.getAttribute('srcdoc')).not.toContain('file:///secret');
  fireEvent.click(screen.getByText('Hide diagram'));
  expect(screen.queryByTitle('Interactive diagram')).toBeNull();
});
it('shows an honest unavailable status without navigating or running missing artifacts', async () => {
  Object.defineProperty(window, 'pip', { configurable: true, value: { readVisualization: vi.fn().mockRejectedValue(Error('gone')) } });
  render(<ChatLink href="/__ally_visualization__/missing">View diagram</ChatLink>);
  await act(async () => fireEvent.click(screen.getByText('View diagram')));
  expect(screen.getByRole('status')).toHaveTextContent('Diagram unavailable');
  expect(screen.queryByTitle('Interactive diagram')).toBeNull();
});
