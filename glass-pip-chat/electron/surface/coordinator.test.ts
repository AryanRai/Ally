import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: '', accept: undefined as any, server: undefined as any, point: { x: 500, y: 10 }, ipc: undefined as any, app: undefined as any }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  mocks.ipc = new EventEmitter(); mocks.ipc.handlers = new Map(); mocks.ipc.handle = (name: string, run: any) => mocks.ipc.handlers.set(name, run); mocks.ipc.removeHandler = (name: string) => mocks.ipc.handlers.delete(name); mocks.app = new EventEmitter(); mocks.app.getPath = () => 'fixture';
  return { app: mocks.app, ipcMain: mocks.ipc, screen: {
    screenToDipPoint: (p: {x:number;y:number}) => ({ x: p.x / 2, y: p.y / 2 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getAllDisplays: () => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }],
    getCursorScreenPoint: () => mocks.point,
  } };
});
vi.mock('node:fs', () => ({ default: {
  mkdirSync: vi.fn(), writeFileSync: (_file:string, value:string) => { mocks.config = value; },
  renameSync: vi.fn(), readFileSync: () => mocks.config, unlinkSync: vi.fn(),
} }));
vi.mock('node:net', async () => {
  const { EventEmitter } = await import('node:events');
  return { default: { createServer: (accept: any) => {
    mocks.accept = accept; const server = new EventEmitter() as any;
    server.listen = (_pipe:string, ready:()=>void) => ready(); server.close = vi.fn(); mocks.server = server; return server;
  } } };
});
import { createSurfaceCoordinator } from './coordinator';

function fixture(visible = false) {
  const hooks = new Map<number, () => void>();
  const contents = { mainFrame: {}, send: vi.fn() };
  const win = Object.assign(new EventEmitter(), {
    webContents: contents, hide: vi.fn(), show: vi.fn(), focus: vi.fn(), restore: vi.fn(), isMinimized: (): boolean => false, showInactive: vi.fn(), isVisible: () => visible, moveTop: vi.fn(), setBounds: vi.fn(), isDestroyed: () => false,
    getNativeWindowHandle: () => Buffer.from([42, 0, 0, 0, 0, 0, 0, 0]),
    getBounds: () => ({ x: 310, y: 82, width: 380, height: 112 }),
    hookWindowMessage: (id:number, run:()=>void) => hooks.set(id, run),
  });
  const coordinator = createSurfaceCoordinator(win as any);
  const socket = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), write: vi.fn(), destroy: vi.fn() });
  const connect = () => { mocks.accept(socket); socket.emit('data', `AUTH ${mocks.config.trim().split('\n')[1]}\n`); };
  const acknowledge = (mainFrame = contents.mainFrame) => {
    const id = [...contents.send.mock.calls].reverse().find(c => c[0] === 'surface:float')?.[1];
    mocks.ipc.emit('surface:ready', { sender: contents, senderFrame: mainFrame }, id);
  };
  return { win, contents, hooks, coordinator, socket, connect, acknowledge };
}
beforeEach(() => { vi.useFakeTimers(); mocks.point = { x: 500, y: 10 }; });
afterEach(() => { mocks.app.emit('will-quit'); mocks.ipc.handlers.clear(); mocks.app.removeAllListeners(); mocks.ipc.removeAllListeners(); vi.useRealTimers(); });

describe('native and floating surface coordinator', () => {
  it('toggles between notch and focused window, waiting for native visibility before hiding', () => {
    const f = fixture(true); f.connect(); f.socket.write.mockClear();
    f.coordinator.toggle();
    expect(f.socket.write).toHaveBeenLastCalledWith('NOTCH\n');
    expect(f.win.hide).not.toHaveBeenCalled();
    f.socket.emit('data', 'SHOWN\n');
    expect(f.win.hide).toHaveBeenCalledOnce();
    f.coordinator.toggle();
    expect(f.socket.write).toHaveBeenLastCalledWith('HIDE\n');
    expect(f.win.show).toHaveBeenCalledOnce();
    expect(f.win.focus).toHaveBeenCalledOnce();
    expect(f.contents.send).toHaveBeenLastCalledWith('focus-main-input');
    expect(f.win.setBounds).not.toHaveBeenCalled();
  });
  it('reverses a pending dock without allowing a stale acknowledgement to hide the window', () => {
    const f = fixture(true); f.connect();
    f.coordinator.toggle(); f.coordinator.toggle();
    f.socket.emit('data', 'SHOWN\n');
    expect(f.win.hide).not.toHaveBeenCalled();
    expect(f.win.focus).toHaveBeenCalledOnce();
    f.coordinator.toggle(); f.socket.emit('data', 'SHOWN\n');
    expect(f.win.hide).toHaveBeenCalledOnce();
  });
  it('keeps the window usable without a native peer and restores minimized windows', () => {
    const f = fixture(); f.win.isMinimized = () => true;
    f.coordinator.toggle();
    expect(f.win.restore).toHaveBeenCalledOnce();
    expect(f.win.show).toHaveBeenCalledOnce();
    expect(f.win.hide).not.toHaveBeenCalled();
    f.connect(); expect(f.socket.write).toHaveBeenLastCalledWith('HIDE\n');
    f.socket.emit('close'); f.coordinator.toggle();
    expect(f.win.show).toHaveBeenCalledTimes(2);
    expect(f.win.hide).not.toHaveBeenCalled();
  });
  it('does not reveal either surface during a capture', async () => {
    const f = fixture(); f.connect();
    const pending = f.coordinator.suspend();
    f.socket.emit('data', 'HIDDEN\n'); await pending;
    f.socket.write.mockClear(); f.coordinator.toggle();
    expect(f.socket.write).not.toHaveBeenCalled();
    expect(f.win.show).not.toHaveBeenCalled();
    expect(f.win.hide).not.toHaveBeenCalled();
  });
  it('requires authentication and rejects extra native peers', () => {
    const f = fixture(); mocks.accept(f.socket); f.socket.emit('data', 'AUTH wrong\n');
    expect(f.socket.destroy).toHaveBeenCalled(); expect(f.win.hide).not.toHaveBeenCalled();
    f.connect();
    const other = Object.assign(new EventEmitter(), { setEncoding: vi.fn(), write: vi.fn(), destroy: vi.fn() });
    mocks.accept(other); other.emit('data', `AUTH ${mocks.config.trim().split('\n')[1]}\n`);
    expect(other.destroy).toHaveBeenCalled();
  });
  it('keeps the notch visible until the real pill has painted, and converts DPI', () => {
    const f = fixture(); f.connect(); f.socket.emit('data', 'SHOWN\n');
    f.socket.write.mockClear(); f.socket.emit('data', 'DETACH 1000 200\n');
    expect(f.win.setBounds).toHaveBeenCalledWith({ x: 310, y: 82, width: 380, height: 112 }, false);
    expect(f.socket.write).not.toHaveBeenCalled(); expect(f.win.showInactive).not.toHaveBeenCalled();
    f.acknowledge({}); expect(f.win.showInactive).not.toHaveBeenCalled();
    f.acknowledge();
    expect(f.socket.write.mock.calls.map(c => c[0])).toEqual(['HIDE\n', 'DRAG 42\n']);
    expect(f.win.showInactive).toHaveBeenCalledOnce();
  });
  it('leaves the notch usable if the renderer cannot acknowledge', async () => {
    const f = fixture(); f.connect(); f.socket.emit('data', 'DETACH 1000 200\n');
    await vi.advanceTimersByTimeAsync(1600); f.acknowledge();
    expect(f.win.showInactive).not.toHaveBeenCalled();
    expect(f.socket.write).not.toHaveBeenCalledWith('HIDE\n');
  });
  it('docks on a user drag release at the display top, never on programmatic moves', () => {
    const f = fixture(); f.connect(); f.coordinator.float(); f.socket.write.mockClear();
    f.win.emit('moved'); expect(f.socket.write).not.toHaveBeenCalled();
    f.win.emit('will-move'); f.win.emit('moved');
    expect(f.socket.write).toHaveBeenCalledWith('NOTCH\n');
    f.socket.emit('data', 'SHOWN\n'); expect(f.win.hide).toHaveBeenCalledOnce();
  });
  it('does not dock below the top band', () => {
    const f = fixture(); f.connect(); f.coordinator.float(); f.socket.write.mockClear(); mocks.point.y = 60;
    f.win.emit('will-move'); f.win.emit('moved'); expect(f.socket.write).not.toHaveBeenCalled();
  });
  it('docks a top-aligned pill grabbed lower in its header and ignores resize', () => {
    const f = fixture(); f.connect(); f.coordinator.float(); f.socket.write.mockClear();
    f.win.getBounds = () => ({ x: 310, y: 0, width: 380, height: 112 }); mocks.point.y = 54;
    f.win.emit('will-resize'); f.win.emit('moved'); expect(f.socket.write).not.toHaveBeenCalled();
    f.win.emit('will-move'); f.win.emit('moved');
    expect(f.socket.write).toHaveBeenCalledWith('NOTCH\n');
    f.socket.write.mockClear(); f.win.emit('moved'); expect(f.socket.write).not.toHaveBeenCalled();
  });
  it('waits for native hiding before Circle capture and restores the notch on cancel', async () => {
    const f = fixture(); f.connect(); let complete = false;
    const pending = f.coordinator.suspend().then(() => { complete = true; });
    await Promise.resolve(); expect(complete).toBe(false);
    f.socket.emit('data', 'HIDDEN\n'); await pending; expect(complete).toBe(true);
    expect(f.coordinator.restore(false)).toBe(true); expect(f.socket.write).toHaveBeenLastCalledWith('NOTCH\n');
  });
  it('fails capture rather than taking a screenshot before native hide', async () => {
    const f = fixture(); f.connect();
    const failure = expect(f.coordinator.suspend()).rejects.toThrow('did not hide');
    await vi.advanceTimersByTimeAsync(1500); await failure;
  });
  it('has no connected idle timer and restores a usable pill after native disconnect', () => {
    const f = fixture(); f.connect(); expect(vi.getTimerCount()).toBe(0);
    f.socket.emit('close'); expect(f.win.showInactive).toHaveBeenCalledOnce();
  });
  const b64 = (t: string) => Buffer.from(t, 'utf8').toString('base64');
  const NL = '\n';
  const preview = (f: ReturnType<typeof fixture>, value: unknown) => mocks.ipc.emit('surface:preview', { sender: f.contents, senderFrame: f.contents.mainFrame }, value);
  it('mirrors live replies into the docked notch only, then returns it to idle', async () => {
    const f = fixture(); f.connect(); f.coordinator.float(); f.socket.write.mockClear();
    preview(f, { preview: { question: 'Q', answer: 'Hel', thinking: false, done: false } });
    expect(f.socket.write).not.toHaveBeenCalled();
    f.win.emit('will-move'); f.win.emit('moved'); f.socket.emit('data', 'SHOWN' + NL);
    expect(f.socket.write).toHaveBeenLastCalledWith(`PREVIEW 0 ${b64('Q')} ${b64('Hel')}` + NL);
    preview(f, { preview: { question: 'Q', answer: 'Hello', thinking: false, done: true } });
    expect(f.socket.write).toHaveBeenLastCalledWith(`PREVIEW 0 ${b64('Q')} ${b64('Hello')}` + NL);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.socket.write).toHaveBeenLastCalledWith('IDLE' + NL);
  });
  it('greets on a user dock but not on startup, and ignores other frames', () => {
    const f = fixture(); preview(f, { greeting: 'Hey there' });
    mocks.ipc.emit('surface:preview', { sender: {}, senderFrame: {} }, { greeting: 'spoofed' });
    f.connect(); f.socket.emit('data', 'SHOWN' + NL);
    expect(f.socket.write).not.toHaveBeenCalledWith(`GREET ${b64('Hey there')}` + NL);
    f.coordinator.float(); f.win.emit('will-move'); f.win.emit('moved'); f.socket.emit('data', 'SHOWN' + NL);
    expect(f.socket.write).toHaveBeenLastCalledWith(`GREET ${b64('Hey there')}` + NL);
  });
  it('round-trips whitelisted native settings and times out without a notch', async () => {
    const f = fixture(); const handler = mocks.ipc.handlers.get('surface:native-settings');
    expect(await handler({ sender: f.contents })).toBeNull();
    f.connect();
    const read = handler({ sender: f.contents }, { key: 'SpeechSpeed', value: 1.2 });
    expect(f.socket.write).toHaveBeenLastCalledWith(`SET SpeechSpeed ${b64('1.2')}` + NL);
    f.socket.emit('data', `SETTINGS ${b64('{"SpeechSpeed":1.2}')}` + NL);
    expect(await read).toEqual({ SpeechSpeed: 1.2 });
    expect(handler({ sender: {} })).toBeNull();
    const slow = handler({ sender: f.contents }); await vi.advanceTimersByTimeAsync(1600); expect(await slow).toBeNull();
  });
  it('keeps long previews to a readable tail', async () => {
    const { previewLine, readingDelay } = await import('./coordinator');
    const line = previewLine({ question: 'q', answer: 'word '.repeat(400), thinking: true, done: false });
    expect(Buffer.from(line.split(' ')[3], 'base64').toString('utf8').length).toBeLessThanOrEqual(601);
    expect(line.startsWith('PREVIEW 1 ')).toBe(true);
    expect(readingDelay('a b c')).toBe(10_000); expect(readingDelay('w '.repeat(100))).toBe(30_000);
  });
  it('treats a pill already shown at startup as floating so it can dock', () => {
    const f = fixture(true); f.connect();
    expect(f.socket.write).toHaveBeenCalledWith('HIDE' + NL);
    f.socket.write.mockClear(); f.win.emit('will-move'); f.win.emit('moved');
    expect(f.socket.write).toHaveBeenCalledWith('NOTCH' + NL);
  });
});
