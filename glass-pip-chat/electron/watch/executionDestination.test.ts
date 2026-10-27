// @vitest-environment node
import { expect, it } from 'vitest';
import { executionDestinationOffer, requirePcExecution } from './executionDestination';

it('offers the desktop route without claiming a phone engine or authenticated provider', () => {
  const offer = executionDestinationOffer();
  expect(offer.suggested).toBe('pc');
  expect(offer.options.find(o => o.location === 'phone')).toMatchObject({ available: false });
  expect(offer.options[0].reason).toContain('checked when sending');
});
it('does not recommend a route when the PC connection is unavailable', () => {
  const offer = executionDestinationOffer(false);
  expect(offer.suggested).toBeNull();
  expect(offer.options.every(o => !o.available)).toBe(true);
});
it('rejects phone or unknown choices rather than silently routing to the PC', () => {
  expect(() => requirePcExecution('pc')).not.toThrow();
  for (const location of ['phone', undefined, null, 'claude', 'PC', true]) {
    expect(() => requirePcExecution(location)).toThrow();
  }
});
