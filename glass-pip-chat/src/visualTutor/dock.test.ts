import { expect, it } from 'vitest';
import { dockCanvas } from './dock';
it('docks beside either side of the pill and stacks without overlap on a narrow display', () => {
  const view = { width: 1920, height: 1080 }, panel = { width: 420, height: 260 };
  expect(dockCanvas(view, { x: 1400, y: 40, width: 400, height: 300 }, panel)).toMatchObject({ left: 968, top: 40 });
  expect(dockCanvas(view, { x: 20, y: 40, width: 400, height: 300 }, panel)).toMatchObject({ left: 432, top: 40 });
  expect(dockCanvas({ width: 440, height: 900 }, { x: 20, y: 20, width: 400, height: 300 }, panel)).toMatchObject({ left: 12, top: 332 });
});
