import { expect, it } from 'vitest';
import { WindowPositions } from './windowPositions';

it('retains independent locations through collapse, clamping, manual moves and restart', () => {
  const positions = new WindowPositions();
  expect(positions.switch('expanded', {x:1200,y:700})).toEqual({x:1200,y:700});
  positions.switch('collapsed', {x:1200,y:700});
  positions.move({x:1500,y:900});
  expect(positions.switch('expanded', {x:1500,y:900})).toEqual({x:1200,y:700});
  // Growing the chat near an edge can clamp it; do not lose its saved location.
  expect(positions.switch('expanded', {x:1120,y:400})).toEqual({x:1120,y:400});
  expect(positions.switch('collapsed', {x:1120,y:400})).toEqual({x:1500,y:900});
  const restored = new WindowPositions(positions.snapshot());
  expect(restored.switch('expanded', {x:0,y:0})).toEqual({x:1200,y:700});
  expect(restored.switch('collapsed', {x:0,y:0})).toEqual({x:1500,y:900});
});
it('ignores corrupt saved locations and preserves negative monitor origins', () => {
  const positions = new WindowPositions({expanded:{x:NaN,y:10},collapsed:{x:-1800,y:-200}});
  expect(positions.switch('expanded', {x:30,y:40})).toEqual({x:30,y:40});
  expect(positions.switch('collapsed', {x:30,y:40})).toEqual({x:-1800,y:-200});
});
