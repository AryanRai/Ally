import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { keepWindowFloating, restoreFloatingLevel } from './windowFloating';

const floatingLevel = process.platform === 'win32' ? 'pop-up-menu' : 'floating';

function fixture(topmost = true) {
  let destroyed = false;
  const win = Object.assign(new EventEmitter(), {
    isDestroyed: () => destroyed,
    isAlwaysOnTop: () => topmost,
    setAlwaysOnTop: vi.fn((value: boolean, _level: string) => {
      topmost = value;
      win.emit('always-on-top-changed', {}, value);
    }),
    show: vi.fn(), focus: vi.fn(), moveTop: vi.fn(),
  });
  const dispose = keepWindowFloating(win as any);
  return { win, dispose, lose: () => { topmost = false; }, destroy: () => { destroyed = true; win.emit('closed'); } };
}

describe('persistent floating window', () => {
  it('repairs an already lost native flag at installation', () => {
    const f = fixture(false);
    expect(f.win.setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(true, floatingLevel);
    expect(f.win.isAlwaysOnTop()).toBe(true);
  });
  it.each(['show', 'restore', 'blur', 'moved', 'always-on-top-changed'])('repairs a lost flag on %s without revealing or focusing', event => {
    const f = fixture(); f.lose();
    f.win.emit(event, {}, false);
    expect(f.win.setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(true, floatingLevel);
    expect(f.win.show).not.toHaveBeenCalled();
    expect(f.win.focus).not.toHaveBeenCalled();
    expect(f.win.moveTop).not.toHaveBeenCalled();
  });
  it('preserves an existing higher capture/annotation level with no repeated native work', () => {
    const f = fixture();
    for (let i = 0; i < 30; i++) { f.win.emit('blur'); f.win.emit('moved'); }
    expect(f.win.setAlwaysOnTop).not.toHaveBeenCalled();
  });
  it('removes lifecycle listeners on disposal and close', () => {
    const f = fixture(); f.dispose(); f.lose(); f.win.emit('blur');
    expect(f.win.setAlwaysOnTop).not.toHaveBeenCalled();
    const g = fixture(); g.destroy(); g.lose(); g.win.emit('show');
    expect(g.win.setAlwaysOnTop).not.toHaveBeenCalled();
    expect(g.win.listenerCount('blur')).toBe(0);
  });
  it('restores the correct platform level when an annotation closes', () => {
    const f = fixture();
    restoreFloatingLevel(f.win as any);
    expect(f.win.setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(true, floatingLevel);
    restoreFloatingLevel(null);
    f.destroy(); restoreFloatingLevel(f.win as any);
    expect(f.win.setAlwaysOnTop).toHaveBeenCalledTimes(1);
  });
  it('does not recurse if a native change reports a transient demotion', () => {
    const f = fixture(); f.lose();
    f.win.setAlwaysOnTop.mockImplementationOnce(() => { f.win.emit('always-on-top-changed', {}, false); });
    f.win.emit('blur');
    expect(f.win.setAlwaysOnTop).toHaveBeenCalledOnce();
  });
});
