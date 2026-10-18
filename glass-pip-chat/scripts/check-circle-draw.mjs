// Isolated Electron QA. Synthetic pixels + real IPC/MCP; no model, mic or production connections.
import { app, BrowserWindow, desktopCapturer, nativeImage, screen } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-unified-selection-'));
app.setPath('userData', temp);
const token = randomBytes(24).toString('hex');
fs.writeFileSync(path.join(temp, 'ally-chats-mcp.json'), JSON.stringify({ token, port: 31369 }));
let captures = 0;
desktopCapturer.getSources = async () => {
  captures++;
  return screen.getAllDisplays().map(display => {
    const width = Math.round(display.bounds.width * display.scaleFactor), height = Math.round(display.bounds.height * display.scaleFactor);
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, grid = x % 100 < 2 || y % 100 < 2;
      pixels[i] = grid ? 95 : 40; pixels[i + 1] = grid ? 85 : 35; pixels[i + 2] = grid ? 70 : 28; pixels[i + 3] = 255;
    }
    return { display_id: String(display.id), thumbnail: nativeImage.createFromBitmap(pixels, { width, height }) };
  });
};
let main, capture;
const preload = path.join(temp, 'main.cjs');
fs.writeFileSync(preload, `const {contextBridge,ipcRenderer}=require('electron');let last=null;ipcRenderer.on('circle:ask',(_,value)=>last=value);contextBridge.exposeInMainWorld('check',{chat:(id,title)=>ipcRenderer.invoke('circle:chat',id,title),circle:()=>ipcRenderer.invoke('circle:start'),last:()=>last,start:(id,capture)=>ipcRenderer.invoke('tutor:start',id,undefined,capture),end:id=>ipcRenderer.invoke('tutor:end',id),show:id=>ipcRenderer.invoke('tutor:show',id),state:()=>ipcRenderer.invoke('tutor:state')});`);
const deadline = setTimeout(() => { console.error('FAIL timeout'); app.exit(1); }, 60000);
const wait = async read => { for (let i = 0; i < 120; i++) { const value = await read(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 40)); } throw Error('UI state timed out'); };
const js = (win, text) => win.webContents.executeJavaScript(text);
async function run() { try {
  const circleModule = await import(pathToFileURL(path.join(root, 'dist/electron/capture/circle.js')));
  const tutorModule = await import(pathToFileURL(path.join(root, 'dist/electron/visualTutor/ipc.js')));
  const { registerChatsMcp } = await import(pathToFileURL(path.join(root, 'dist/electron/chatsMcp/index.js')));
  circleModule.registerCircleIpc(() => main ?? null); tutorModule.registerVisualTutorIpc(() => main ?? null); registerChatsMcp(() => main ?? null);
  await app.whenReady();
  main = new BrowserWindow({ show: false, width: 360, height: 240, webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await main.loadURL('data:text/html,<html><body>Isolated Ally selection QA</body></html>');
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const originalBounds = { x: display.bounds.x + 30, y: display.bounds.y + 30, width: 360, height: 240 }; main.setBounds(originalBounds);
  const config = JSON.parse(fs.readFileSync(path.join(temp, 'ally-chats-mcp.json')));
  const rpc = async (name, args) => (await (await fetch(`http://127.0.0.1:${config.port}/mcp/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()).result;
  for (const shape of ['Freehand', 'Rectangle']) {
    const before = captures;
    const actualBounds = main.getBounds(); // Windows can round requested bounds at fractional display scales.
    await js(main, "window.check.chat('exact-chat','Design review').then(()=>window.check.circle())");
    const selection = BrowserWindow.getAllWindows().find(win => win.id !== main.id);
    await wait(() => js(selection, "!!document.querySelector('[aria-label=\"Ally screen selection\"]') && !!document.querySelector('img')"));
    assert.deepEqual(await js(selection, 'Object.keys(window.pip)'), ['circle']);
    const context = await js(selection, 'window.pip.circle.context()'); assert.equal(context.title, 'Design review'); assert.equal(context.anchor.x, actualBounds.x - display.bounds.x);
    assert.equal(await js(selection, "document.body.textContent.includes('Draw to explain')"), false);
    const original = nativeImage.createFromDataURL(await js(selection, 'window.pip.circle.getShot()'));
    await js(selection, `[...document.querySelectorAll('button')].find(b=>b.textContent==='${shape}').click()`);
    await js(selection, `(()=>{const canvas=document.querySelector('canvas');canvas.setPointerCapture=()=>{};for(const [type,x,y] of [['pointerdown',450,200],['pointermove',650,250],['pointermove',800,400],['pointerup',800,400]])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:x,clientY:y,pointerId:1}));})()`);
    await wait(() => js(selection, "!!document.querySelector('[aria-label=\"Question about selection\"]')"));
    assert.equal(await js(selection, "document.activeElement.getAttribute('aria-label')"), 'Question about selection');
    await js(selection, 'Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))');
    fs.writeFileSync(path.join(temp, `${shape.toLowerCase()}.png`), (await selection.webContents.capturePage()).toPNG());
    void js(selection, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Explain').click()").catch(() => {});
    const ask = await wait(async () => { const value = await js(main, 'window.check.last()'); return value?.tutorCaptureId && value.tutorCaptureId !== capture?.token ? value : null; });
    assert.equal(ask.chatId, 'exact-chat'); assert.equal(ask.imagePath, '');
    await assert.rejects(js(main, `window.check.start('other-chat',${JSON.stringify(ask.tutorCaptureId)})`), /another chat/);
    capture = await js(main, `window.check.start('exact-chat',${JSON.stringify(ask.tutorCaptureId)})`); capture.token = ask.tutorCaptureId;
    const overlay = BrowserWindow.getAllWindows().find(win => win.id !== main.id);
    assert.equal(overlay.isVisible(), false, 'selection alone does not launch drawing UI'); assert.equal(capture.board.frozen, true);
    assert.equal(captures - before, 1, 'selection uses one capture');
    const padding = shape === 'Freehand' ? 10 : 0, scale = original.getSize().width / display.bounds.width;
    const rect = { x: Math.round((450-padding)*scale), y: Math.round((200-padding)*scale), width: Math.round((350+padding*2)*scale), height: Math.round((200+padding*2)*scale) };
    assert.deepEqual(nativeImage.createFromPath(capture.imagePath).toBitmap(), original.crop(rect).toBitmap());
    await assert.rejects(js(main, `window.check.start('exact-chat',${JSON.stringify(ask.tutorCaptureId)})`), /expired/);
    const step = { id: 'explanation', title: 'A drawing in your chat', explanation: 'The arrow stays aligned with the original selected pixels.', marks: [{ id: 'arrow', kind: 'arrow', color: 'mint', points: [{ x: capture.board.focus.x, y: capture.board.focus.y }, { x: capture.board.focus.x + capture.board.focus.width, y: capture.board.focus.y + capture.board.focus.height }] }] };
    const draw = await rpc('visual_tutor_draw', { boardId: capture.board.id, step }); assert.ok(!draw.isError, JSON.stringify(draw));
    await wait(() => overlay.isVisible()); await wait(() => js(overlay, "document.querySelector('h1')?.textContent === 'A drawing in your chat'"));
    await wait(() => js(overlay, "document.querySelector('.tutor-frozen')?.naturalWidth > 0 && document.querySelectorAll('svg.tutor-marks > g').length === 1"));
    await js(overlay, 'Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
    const painted = await overlay.webContents.capturePage();
    const pixels = painted.toBitmap(); let mint = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i+3] > 100 && pixels[i+1] > 130 && pixels[i+1] > pixels[i]*1.1 && pixels[i+1] > pixels[i+2]*1.1) mint++;
    assert.ok(mint > 30, `Drawing must paint visible pixels (${mint})`);
    fs.writeFileSync(path.join(temp, `drawing-${shape.toLowerCase()}.png`), painted.toPNG());
    await js(overlay, `window.tutor.action(${JSON.stringify(capture.board.id)},'chat')`); assert.equal(overlay.isVisible(), false); assert.equal(main.isVisible(), true);
    await rpc('visual_tutor_draw', { boardId: capture.board.id, step }); assert.equal(overlay.isVisible(), false, 'late drawing updates respect return to chat');
    await js(main, `window.check.show(${JSON.stringify(capture.board.id)})`); assert.equal(overlay.isVisible(), true);
    await js(main, `window.check.end(${JSON.stringify(capture.board.id)})`);
    assert.ok((await rpc('visual_tutor_draw', { boardId: capture.board.id, step })).isError, 'ending revokes late tool calls');
    fs.rmSync(capture.imagePath, { force: true });
  }
  const beforeCancel = await js(main, 'window.check.last()');
  const boundsBeforeCancel = main.getBounds();
  await js(main, 'window.check.circle()');
  const cancel = BrowserWindow.getAllWindows().find(win => win.id !== main.id);
  await wait(() => js(cancel, "!!document.querySelector('[aria-label=\"Cancel selection\"]')"));
  void js(cancel, "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))").catch(() => {});
  await wait(() => BrowserWindow.getAllWindows().length === 1);
  assert.deepEqual(main.getBounds(), boundsBeforeCancel); assert.equal(main.isVisible(), true); assert.deepEqual(await js(main, 'window.check.last()'), beforeCancel);
  // Inspect the actual engine method without constructing capture/transcription services.
  const { PerceptionEngine } = await import(pathToFileURL(path.join(root, 'dist/electron/perception/engine.js')));
  const engine = Object.create(PerceptionEngine.prototype); engine.session = { state: 'running', sessionId: 'original' };
  await assert.rejects(engine.start({ sessionId: 'other' }), /End the current meeting/); assert.equal(engine.session.sessionId, 'original');
  console.log(JSON.stringify({ status: 'PASS', freehand: true, rectangle: true, exactCrop: true, deferredDrawing: true, sameChat: true, returnToChat: true, escape: true, protectedMeeting: true, previews: temp }));
  clearTimeout(deadline); app.exit(0);
} catch (error) { console.error(error.stack ?? error); if (capture?.imagePath) fs.rmSync(capture.imagePath, { force: true }); clearTimeout(deadline); app.exit(1); } }
void run();
