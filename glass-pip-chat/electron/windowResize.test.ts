import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ events: new Map<string, Function>(), ipc: new Map<string, Function>(), app: new Map<string, Function>(), writes: vi.fn(), send: vi.fn(), position: vi.fn(), width: 400, height: 560 }));
vi.mock('node:fs', () => ({ default: { readFileSync: () => { throw Error('isolated fixture'); }, writeFileSync: fixture.writes } }));
vi.mock('electron', () => ({
  app: { getPath: () => 'synthetic-userdata', once: (name: string, fn: Function) => fixture.app.set(name, fn) },
  ipcMain: { on: (name: string, fn: Function) => fixture.ipc.set(name, fn), handle: vi.fn() },
  screen: { getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 2000, height: 2000 } }) },
  BrowserWindow: class {
    webContents = { send: fixture.send };
    on(name: string, fn: Function) { const old = fixture.events.get(name); fixture.events.set(name, (...args: unknown[]) => { old?.(...args); fn(...args); }); }
    once() {}
    async loadFile() {}
    getBounds() { return { x: 20, y: 20, width: fixture.width, height: fixture.height }; }
    getPosition() { return [20, 20]; }
    getSize() { return [fixture.width, fixture.height]; }
    setSize(width: number, height: number) { fixture.width = width; fixture.height = height; fixture.events.get('resize')?.(); }
    setPosition = fixture.position;
    isDestroyed() { return false; }
  },
  Tray: class {}, Menu: {}, nativeImage: {},
}));
afterEach(() => vi.useRealTimers());
it('keeps native resize bursts off disk and acknowledges the final/no-op request without repositioning', async () => {
  vi.useFakeTimers();
  const { createWindow, registerWindowIpc } = await import('./window');
  await createWindow(); registerWindowIpc();
  for (let i = 0; i < 1000; i++) fixture.events.get('resize')!();
  expect(fixture.writes).not.toHaveBeenCalled();
  vi.advanceTimersByTime(150);
  expect(fixture.writes).toHaveBeenCalledTimes(1);
  fixture.writes.mockClear();
  const resize = fixture.ipc.get('window:resize')!;
  resize({}, { width: 480, height: 680 });
  resize({}, { width: 480, height: 700 });
  expect(fixture.position).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(fixture.writes).toHaveBeenCalledTimes(1);
  expect(fixture.send).toHaveBeenCalledTimes(1);
  expect(fixture.send).toHaveBeenLastCalledWith('window:resize-complete', { width: 480, height: 700 });
  resize({}, { width: 480, height: 700 });
  expect(fixture.send).toHaveBeenCalledTimes(2);
  fixture.events.get('move')!(); fixture.app.get('before-quit')!();
  expect(fixture.writes).toHaveBeenCalledTimes(2);
  vi.runAllTimers(); expect(fixture.writes).toHaveBeenCalledTimes(2);
  fixture.events.get('will-resize')!();
  fixture.width = 310; fixture.height = 900; fixture.events.get('resize')!();
  resize({}, { width: 480, height: 700 });
  expect(fixture.width).toBe(310);
  vi.advanceTimersByTime(150);
  expect(fixture.send).toHaveBeenLastCalledWith('window:manual-resize', { width: 310, height: 900 });
  fixture.events.get('will-resize')!(); // constrained edge drag can produce no resize event
  vi.advanceTimersByTime(150);
  resize({}, { width: 500, height: 700 });
  expect(fixture.width).toBe(500);
  vi.runAllTimers();
});
