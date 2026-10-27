import { afterEach, expect, it, vi } from 'vitest';
import { isSurfaceVisible, waitForSurfaceVisible } from '../../../ally-study/notch-ui/surfaceVisibility';
afterEach(() => { vi.restoreAllMocks(); delete (window as unknown as {__allySurfaceVisible?: boolean}).__allySurfaceVisible; });
it('blocks hidden native-chat reads until the correct native visibility event', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const native = window as unknown as {__allySurfaceVisible?: boolean}; native.__allySurfaceVisible = false;
  const ready = vi.fn(); const waiting = waitForSurfaceVisible().then(ready);
  expect(isSurfaceVisible()).toBe(false);
  window.dispatchEvent(new Event('ally-surface-visibility')); await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
  native.__allySurfaceVisible = true;
  window.dispatchEvent(new Event('ally-surface-visibility')); await waiting;
  expect(ready).toHaveBeenCalledOnce();
  expect(isSurfaceVisible()).toBe(true);
});
