import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
// Run with Electron after build:vite and build:electron. No model requests,
// device connections, production configuration or normal Ally restart.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testData = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-tutor-native-check-'));
app.setPath('userData', testData);
const token = randomBytes(24).toString('hex');
fs.writeFileSync(path.join(testData, 'ally-chats-mcp.json'), JSON.stringify({ token, port: 31367 }));
fs.writeFileSync(path.join(testData, 'tutor-test-preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('testTutor',{start:(id,display)=>ipcRenderer.invoke('tutor:start',id,display),displays:()=>ipcRenderer.invoke('tutor:displays'),state:()=>ipcRenderer.invoke('tutor:state'),end:id=>ipcRenderer.invoke('tutor:end',id)});`);
const mouse = new Map();
const ignore = BrowserWindow.prototype.setIgnoreMouseEvents;
BrowserWindow.prototype.setIgnoreMouseEvents = function(value, ...args) { mouse.set(this.id, value); return ignore.call(this, value, ...args); };
let main, capture;
const deadline = setTimeout(() => { if (capture) fs.rmSync(capture.imagePath, { force: true }); console.error('FAIL Native test timed out'); app.exit(1); }, 45000);
async function run() { try {
  const { registerVisualTutorIpc } = await import(pathToFileURL(path.join(root, 'dist/electron/visualTutor/ipc.js')));
  const { registerChatsMcp } = await import(pathToFileURL(path.join(root, 'dist/electron/chatsMcp/index.js')));
  registerVisualTutorIpc(() => main ?? null);
  registerChatsMcp(() => main ?? null);
  await app.whenReady();
  main = new BrowserWindow({ show: false, width: 500, height: 300, webPreferences: { preload: path.join(testData, 'tutor-test-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await main.loadURL('data:text/html,<html><body>Ally tutor isolated integration check</body></html>');
  capture = await main.webContents.executeJavaScript("window.testTutor.displays().then(displays => window.testTutor.start('native-test-chat', displays.at(-1).id))");
  assert.ok(fs.statSync(capture.imagePath).size > 1000, 'actual OS capture has pixels');
  const overlay = BrowserWindow.getAllWindows().find(win => win.id !== main.id);
  assert.ok(overlay, 'real overlay window exists');
  assert.equal(mouse.get(overlay.id), true, 'native click-through is enabled');
  console.log('OVERLAY_BOUNDS', JSON.stringify({actual:overlay.getBounds(),content:overlay.getContentBounds(),expected:capture.board.bounds,viewport:await overlay.webContents.executeJavaScript('({innerWidth,innerHeight,devicePixelRatio,screenX,screenY,outerWidth,outerHeight})')}));
  const bounds = overlay.getBounds();
  assert.equal(bounds.x, capture.board.bounds.x); assert.equal(bounds.y, capture.board.bounds.y);
  assert.ok(Math.abs(bounds.width - capture.board.bounds.width) <= 2 && Math.abs(bounds.height - capture.board.bounds.height) <= 2, 'native bounds stay within mixed-DPI rounding');
  const apiKeys = await overlay.webContents.executeJavaScript('Object.keys(window.tutor).sort()');
  assert.deepEqual(apiKeys, ['action', 'interactive', 'onChanged', 'overlay', 'sketch']);
  assert.equal(await overlay.webContents.executeJavaScript("typeof window.pip"), 'undefined', 'overlay has no agent/device bridge');
  const config = JSON.parse(fs.readFileSync(path.join(testData, 'ally-chats-mcp.json')));
  const rpc = async (name, args) => {
    const response = await fetch(`http://127.0.0.1:${config.port}/mcp/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    assert.equal(response.status, 200); return (await response.json()).result;
  };
  // A true 3–4–5 triangle and square sides across any monitor aspect ratio.
  const unit = Math.min(capture.board.bounds.width / 12, capture.board.bounds.height / 10);
  const p = (x, y) => ({ x: x * unit / capture.board.bounds.width * 1000, y: y * unit / capture.board.bounds.height * 1000 });
  const scene = { id: 'area', title: 'Why a² is an area', explanation: 'Each square is built on one side of the triangle. Compare their areas, not the lengths of their edges.', marks: [
    { id: 'triangle', kind: 'polyline', color: 'mint', points: [p(4.2, .2), p(4.2, 4.2), p(7.2, 4.2), p(4.2, .2)] },
    { id: 'a-square', kind: 'rect', color: 'blue', points: [p(4.2, 4.2), p(7.2, 7.2)], text: 'a² = area' },
    { id: 'b-square', kind: 'rect', color: 'pink', points: [p(.2, .2), p(4.2, 4.2)], text: 'b²' },
    { id: 'look', kind: 'arrow', color: 'amber', points: [p(10, 1.5), p(6, 2.5)], text: 'The longest side: c' },
    { id: 'title', kind: 'text', color: 'white', points: [p(8, .7)], text: 'a² + b² = c²' },
  ] };
  const drawn = await rpc('visual_tutor_draw', { boardId: capture.board.id, step: scene });
  assert.ok(!drawn.isError, JSON.stringify(drawn));
  // Wait for the renderer's own scene update, not a guessed rendering delay.
  const waitFor = async (expression) => {
    const limit = Date.now() + 6000;
    while (Date.now() < limit) { if (await overlay.webContents.executeJavaScript(expression)) return; await new Promise(resolve => setTimeout(resolve, 40)); }
    throw new Error(`Renderer state did not arrive: ${expression}`);
  };
  await waitFor("document.querySelector('h1')?.textContent === 'Why a² is an area'");
  assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.tutor-drawings').style.width"), `${capture.board.bounds.width}px`, 'drawing surface uses capture coordinates instead of native rounding');
  assert.equal(await overlay.webContents.executeJavaScript("document.querySelectorAll('svg.tutor-marks > g').length"), 5);
  await overlay.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await overlay.webContents.executeJavaScript('Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))).then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))');
  const painted = await overlay.webContents.capturePage();
  const pixels = painted.toBitmap();
  const paintedSize = painted.getSize();
  let visibleMint = 0;
  for (let offset = 0; offset < paintedSize.width * Math.floor(paintedSize.height * .65) * 4; offset += 4) {
    if (pixels[offset + 3] > 100 && pixels[offset + 1] > 130 && pixels[offset + 1] > pixels[offset] * 1.1 && pixels[offset + 1] > pixels[offset + 2] * 1.1) visibleMint++;
  }
  assert.ok(visibleMint > 200, `Drawing must paint actual visible pixels, not just SVG nodes (${visibleMint})`);
  fs.writeFileSync(path.join(testData, 'tutor-native-overlay.png'), painted.toPNG());
  console.log('CHECK screenshot saved');
  await overlay.webContents.executeJavaScript(`window.tutor.interactive(true)`);
  console.log('CHECK toolbar entered');
  await rpc('visual_tutor_draw', { boardId: capture.board.id, step: scene });
  console.log('CHECK toolbar retained');
  assert.equal(mouse.get(overlay.id), false, 'tool updates preserve a hovered toolbar');
  await overlay.webContents.executeJavaScript(`window.tutor.interactive(false);window.tutor.action(${JSON.stringify(capture.board.id)},'freeze')`);
  console.log('CHECK freeze invoked');
  await waitFor("!!document.querySelector('.tutor-frozen')");
  assert.equal(mouse.get(overlay.id), false, 'frozen screenshot blocks accidental clicks to underlying apps');
  await overlay.webContents.executeJavaScript(`window.tutor.action(${JSON.stringify(capture.board.id)},'freeze');window.tutor.action(${JSON.stringify(capture.board.id)},'sketch')`);
  console.log('CHECK sketch invoked');
  await waitFor("!!document.querySelector('.tutor-sketch-surface')");
  await overlay.webContents.executeJavaScript(`window.tutor.sketch(${JSON.stringify(capture.board.id)},[{x:450,y:350},{x:490,y:380}])`);
  console.log('CHECK sketch sent');
  const read = await rpc('visual_tutor_read', { boardId: capture.board.id });
  assert.equal(JSON.parse(read.content[0].text).sketches.length, 1);
  // Closing destroys the evaluating renderer, so inspect the main-side result instead.
  void overlay.webContents.executeJavaScript(`window.tutor.action(${JSON.stringify(capture.board.id)},'close')`).catch(() => {});
  const closingDeadline = Date.now() + 5000;
  while (await main.webContents.executeJavaScript('window.testTutor.state()')) { if (Date.now() > closingDeadline) throw new Error('Close did not revoke board'); await new Promise(resolve => setTimeout(resolve, 30)); }
  console.log('CHECK close invoked');
  const late = await rpc('visual_tutor_draw', { boardId: capture.board.id, step: scene });
  assert.equal(late.isError, true, 'late agent results cannot reopen the overlay');
  assert.equal(await main.webContents.executeJavaScript('window.testTutor.state()'), null);
  console.log(JSON.stringify({ status: 'PASS', capture: true, realOverlay: true, mcpDrawing: true, restrictedPreload: true, coordinateMapping: true, clickThrough: true, freeze: true, sketchReadback: true, staleSessionRejected: true, screenshot: path.join(testData, 'tutor-native-overlay.png') }));
  clearTimeout(deadline);
  if (capture) fs.rmSync(capture.imagePath, { force: true });
  app.exit(0);
} catch (error) {
  console.error('FAIL', error.stack ?? error);
  clearTimeout(deadline);
  if (capture) fs.rmSync(capture.imagePath, { force: true });
  app.exit(1);
} }
void run();
