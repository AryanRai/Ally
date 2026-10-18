import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CircleSelectionControls from './CircleSelectionControls';
afterEach(cleanup);
it('keeps selection tools in the real pill and removes them on completion, without sending a message', async () => {
  let update: (state: any) => void = () => {};
  const action = vi.fn(), stop = vi.fn();
  Object.defineProperty(window, 'pip', { configurable: true, value: { circle: {
    selectionState: async () => ({ active: true, tool: 'freehand', ready: true }),
    onSelection: (cb: any) => { update = cb; return stop; }, selectionAction: action,
  } } });
  const { unmount } = await act(async () => render(<CircleSelectionControls />));
  fireEvent.click(screen.getByText('Rectangle')); expect(action).toHaveBeenCalledWith('rectangle');
  fireEvent.click(screen.getByText('Whole screen')); expect(action).toHaveBeenCalledWith('whole');
  act(() => update({ active: true, tool: 'rectangle', ready: true, sending: true }));
  expect(screen.getByText('Whole screen')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Cancel selection')); expect(action).toHaveBeenCalledWith('cancel');
  act(() => update({ active: false, tool: 'freehand' }));
  expect(screen.queryByRole('region')).toBeNull();
  unmount(); expect(stop).toHaveBeenCalledOnce();
});
