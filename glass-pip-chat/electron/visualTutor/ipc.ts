import { app, BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureDisplay, takeCircleTutorCapture, setCircleCaptureCleanup } from '../capture/circle.js';
import { circlePixels } from '../capture/circleHandoff.js';
import { registerDeviceTool } from '../chatsMcp/index.js';
import { text } from '../chatsMcp/protocol.js';
import { TutorModel, tutorPrompt } from './model.js';
import { MAX_DIAGRAM_HEIGHT, MAX_DIAGRAM_IMAGES, type TutorAction, type TutorBoard, type TutorCapture } from './types.js';
import { prepareDiagramImages } from './diagramMedia.js';
import { restoreFloatingLevel } from '../windowFloating.js';
import { chatSelection } from '../agent/selection.js';
import { studyPresentation, submitNativeStudy } from '../surface/coordinator.js';
import { StudyInputs, studyKey } from './studyInputs.js';
import { registerStudySession, StudyCues } from './studySession.js';
import { safeWindowSend } from '../safeWindowSend.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const captureDir = path.join(os.tmpdir(), 'ally-visual-tutor');
const model = new TutorModel();
let overlay: BrowserWindow | null = null;
let screenshot = '';
let starting = false;
let toolbarInteractive = false;
let revealOnDraw = true;
let panelAnchor: TutorBoard['panelAnchor'];
let anchorSequence = 0;
let geometryTimer: ReturnType<typeof setTimeout> | undefined;
let selectionImagePath = '';
const cues = new StudyCues();

/** The drawing surface has its own preload: it cannot invoke agent, device or file APIs. */
export function registerVisualTutorIpc(getMain: () => BrowserWindow | null): void {
  const studyRoot = process.env.ALLY_STUDY_ROOT || path.resolve(app.getAppPath(), '../ally-study');
  const inputs = new StudyInputs(studyRoot);
  const fromMain = (event: IpcMainInvokeEvent) => {
    if (event.sender !== getMain()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Visual tutor must be opened from Ally');
  };
  const fromOverlay = (event: IpcMainInvokeEvent) => {
    if (event.sender !== overlay?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Invalid visual tutor surface');
  };
  const presentation = () => {
    const board = model.get(), main = getMain();
    if (board) {
      board.visible = !!overlay?.isVisible();
      if (panelAnchor) board.panelAnchor = { ...panelAnchor };
      const bounds = main?.getBounds();
      if (bounds) board.pillBounds = { ...bounds, x: bounds.x - board.bounds.x, y: bounds.y - board.bounds.y };
    }
    return board;
  };
  const keepPillAbove = () => {
    const main = getMain();
    if (overlay?.isVisible() && main?.isVisible()) { main.setAlwaysOnTop(true, 'screen-saver'); main.moveTop(); }
  };
  const publish = () => {
    const board = presentation();
    safeWindowSend(getMain(), 'tutor:changed', board);
    safeWindowSend(overlay, 'tutor:changed', board);
    if (overlay && board) overlay.setIgnoreMouseEvents(!toolbarInteractive && !board.sketching, { forward: true });
  };
  const close = () => {
    if (geometryTimer) { clearTimeout(geometryTimer); geometryTimer = undefined; }
    const board = model.get();
    if (board) model.end(board.id);
    screenshot = '';
    selectionImagePath = ''; cues.reset();
    panelAnchor = undefined;
    revealOnDraw = true;
    toolbarInteractive = false;
    const closing = overlay; overlay = null;
    closing?.close();
    restoreFloatingLevel(getMain());
    publish();
  };

  setCircleCaptureCleanup(close);
  const openOverlay = async (board: TutorBoard) => {
    const created = new BrowserWindow({ ...board.bounds, frame: false, thickFrame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    overlay = created;
    created.setAlwaysOnTop(true, 'screen-saver'); created.setBounds(board.bounds);
    created.setIgnoreMouseEvents(true, { forward: true }); created.on('focus', keepPillAbove);
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    created.webContents.on('will-navigate', event => event.preventDefault());
    created.webContents.on('will-frame-navigate', event => { if (!['about:blank', 'about:srcdoc'].includes(event.url)) event.preventDefault(); });
    created.on('closed', () => { if (overlay === created) { overlay = null; if (model.get()?.id === board.id) model.end(board.id); screenshot = ''; selectionImagePath = ''; cues.reset(); publish(); } });
    if (process.env.VITE_DEV_SERVER_URL) await created.loadURL(new URL('tutor.html', process.env.VITE_DEV_SERVER_URL).toString());
    else await created.loadFile(path.join(__dirname, '../../renderer/tutor.html'));
    return created;
  };
  const revealCue = (stepId: string | undefined) => {
    const board = model.get();
    if (!stepId || board?.presentation !== 'study' || !revealOnDraw || !board.following) return;
    model.activate(board.id, stepId); overlay?.showInactive(); keepPillAbove(); publish();
  };
  const caption = (words: string) => revealCue(cues.hear(words));
  studyPresentation.on('caption', caption);
  const unregisterStudy = registerStudySession(async input => {
    let context: { diagramBoardId?: string; screenshot?: { widthInPixels?: number; heightInPixels?: number }; selection?: { bounds?: TutorBoard['bounds']; capturedAt?: number } } = {};
    try { context = JSON.parse(input.context); } catch { /* Legacy context has no geometry. */ }
    let board = model.get();
    if (!board || (board.sessionKey !== input.sessionKey && board.chatId !== input.chatId)) {
      close();
      const display = screen.getAllDisplays().find(display => context.selection?.bounds && JSON.stringify(display.bounds) === JSON.stringify(context.selection.bounds)) ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const width = context.screenshot?.widthInPixels, height = context.screenshot?.heightInPixels;
      const screenPixels = { width: typeof width === 'number' && width > 0 && Number.isFinite(width) ? width : Math.round(display.bounds.width * display.scaleFactor), height: typeof height === 'number' && height > 0 && Number.isFinite(height) ? height : Math.round(display.bounds.height * display.scaleFactor) };
      board = { id: randomUUID(), chatId: input.chatId, sessionKey: input.sessionKey, presentation: 'study', screenPixels, displayId: display.id, bounds: { ...display.bounds }, capturedAt: context.selection?.capturedAt ?? Date.now(), steps: [], sketches: [], selected: 0, following: true, sketching: false, frozen: false, revision: 0 };
      model.start(board); await openOverlay(board);
    } else if (board.sessionKey !== input.sessionKey) { board.sessionKey = input.sessionKey; model.start(board); }
    if (input.imagePath) selectionImagePath = input.imagePath;
    publish();
    return `Shared Study board: ${board.id}. For interactive HTML/SVG cards use ally_chats study_diagram with this boardId. cue must exactly match a short say() sentence: the card appears on that spoken caption. Update a stable id incrementally; new id means next step. Start a short spoken beat before building a large diagram. visual_tutor_read includes user sketches. Keep screen annotations in native step()/say(), and actions in agent tools.`;
  });
  app.once('will-quit', () => { unregisterStudy(); studyPresentation.off('caption', caption); });
  ipcMain.handle('tutor:study', async (event, id: string, words: unknown) => {
    fromMain(event);
    const board = model.require(id), selected = chatSelection.snapshot().selected;
    if (board.presentation !== 'study' || !selected || typeof words !== 'string') throw Error('Select an area in this chat first.');
    const requestId = inputs.issue(board, selected, words, selectionImagePath);
    await submitNativeStudy(requestId);
  });
  ipcMain.handle('tutor:displays', event => { fromMain(event); return screen.getAllDisplays().map((display, index) => ({ id: display.id, label: `${display.label || `Display ${index + 1}`} · ${display.size.width} × ${display.size.height}` })); });
  ipcMain.handle('tutor:start', async (event, chatId: unknown, displayId?: number, circleCaptureId?: string): Promise<TutorCapture> => {
    fromMain(event);
    if (typeof chatId !== 'string' || !chatId || chatId.length > 240) throw new Error('Choose a chat first');
    if (starting) throw new Error('A screen capture is already starting');
    const circle = circleCaptureId === undefined ? undefined : takeCircleTutorCapture(circleCaptureId, chatId);
    starting = true;
    const main = getMain();
    const wasVisible = !!main?.isVisible();
    try {
      close();
      const requestedDisplay = circle?.display.id ?? displayId;
      const display = requestedDisplay === undefined ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) : screen.getAllDisplays().find(display => display.id === requestedDisplay);
      if (!display) throw new Error('That display is no longer connected. Choose another display.');
      if (circle && JSON.stringify(circle.display.bounds) !== JSON.stringify(display.bounds)) throw Error('The display changed since you circled it. Circle the area again.');
      if (!circle && wasVisible) main!.hide();
      if (!circle) await new Promise(resolve => setTimeout(resolve, 160));
      const image = circle?.image ?? await captureDisplay(display);
      if (image.isEmpty()) throw new Error('Screen capture is unavailable. Check system screen-recording permissions.');
      const selected = circle?.rect ? image.crop(circlePixels(circle.rect, display.bounds, image.getSize())) : image;
      const size = selected.getSize();
      const small = size.width > 1920 ? selected.resize({ width: 1920 }) : selected;
      fs.mkdirSync(captureDir, { recursive: true });
      // Finite capture history, same temporary-file approach as Circle to Ask.
      const existing = fs.readdirSync(captureDir).filter(name => /^tutor-[a-f0-9-]+\.png$/.test(name))
        .map(name => ({ name, time: fs.statSync(path.join(captureDir, name)).mtimeMs })).sort((a, b) => b.time - a.time);
      existing.forEach((entry, index) => {
        if (index >= 19 || Date.now() - entry.time > 24 * 60 * 60_000) fs.rmSync(path.join(captureDir, entry.name), { force: true });
      });
      const id = randomUUID();
      const imagePath = path.join(captureDir, `tutor-${id}.png`);
      fs.writeFileSync(imagePath, small.toPNG());
      // Freeze uses the local full display; the agent receives only the selected crop.
      screenshot = (image.getSize().width > 1920 ? image.resize({ width: 1920 }) : image).toDataURL();
      const focus = circle?.rect && { x: circle.rect.x / display.bounds.width * 1000, y: circle.rect.y / display.bounds.height * 1000, width: circle.rect.width / display.bounds.width * 1000, height: circle.rect.height / display.bounds.height * 1000 };
      const selectedChat = chatSelection.snapshot().selected;
      if (!selectedChat) throw Error('Choose a chat in Ally before selecting an area.');
      const board: TutorBoard = { id, chatId, sessionKey: studyKey(selectedChat), presentation: 'study', screenPixels: image.getSize(), displayId: display.id, bounds: { ...display.bounds }, capturedAt: circle?.capturedAt ?? Date.now(), ...(focus ? { focus } : {}), steps: [], sketches: [], selected: 0, following: true, sketching: false, frozen: false, revision: 0 };
      board.screenBounds = process.platform === 'win32' ? screen.dipToScreenRect(null, display.bounds) : { ...display.bounds };
      model.start(board);
      selectionImagePath = imagePath;
      await openOverlay(board);
      if (wasVisible) main?.showInactive();
      keepPillAbove();
      publish();
      return { board, imagePath, thumbnail: `data:image/jpeg;base64,${small.resize({ width: 360 }).toJPEG(70).toString('base64')}` };
    } catch (error) {
      close();
      if (wasVisible) main?.show();
      throw error;
    } finally { starting = false; }
  });
  ipcMain.handle('tutor:show', (event, id: string, point?: { x: number; y: number }) => {
    fromMain(event); const board = model.require(id);
    if (point !== undefined) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 100000 || Math.abs(point.y) > 100000) throw Error('Invalid drawing position');
      panelAnchor = { x: Math.max(0, Math.min(1000, (point.x - board.bounds.x) / board.bounds.width * 1000)), y: Math.max(0, Math.min(1000, (point.y - board.bounds.y) / board.bounds.height * 1000)), sequence: ++anchorSequence };
    }
    revealOnDraw = true; overlay?.showInactive(); keepPillAbove(); publish();
  });
  ipcMain.handle('tutor:state', event => { fromMain(event); return presentation(); });
  ipcMain.handle('tutor:overlay', event => { fromOverlay(event); return { board: presentation(), screenshot }; });
  ipcMain.handle('tutor:end', (event, id: string) => { fromMain(event); if (model.get()?.id === id) close(); });
  ipcMain.handle('tutor:action', (event, id: string, action: TutorAction) => {
    if (event.sender === getMain()?.webContents) fromMain(event); else fromOverlay(event);
    model.require(id);
    switch (action) {
      case 'close': close(); return;
      case 'chat': revealOnDraw = false; if (model.get()?.sketching) model.toggle(id, 'sketching'); overlay?.hide(); getMain()?.show(); getMain()?.focus(); getMain()?.webContents.send('focus-main-input'); publish(); return;
      case 'previous': case 'next': case 'latest': model.select(id, action); break;
      case 'sketch': model.toggle(id, 'sketching'); break;
      case 'freeze': model.toggle(id, 'frozen'); break;
      case 'undo': model.undo(id); break;
      default: throw new Error('Unknown visual tutor action');
    }
    publish();
  });
  ipcMain.handle('tutor:sketch', (event, id: string, points: unknown) => { fromOverlay(event); model.sketch(id, points); publish(); });
  ipcMain.on('tutor:interactive', (event, interactive: unknown) => {
    if (event.sender !== overlay?.webContents || typeof interactive !== 'boolean') return;
    toolbarInteractive = interactive;
    const board = model.get();
    overlay?.setIgnoreMouseEvents(!interactive && !board?.sketching, { forward: true });
  });

  registerDeviceTool({ name: 'visual_tutor_read', description: 'Read an explicitly opened Ally visual tutor board, including teaching steps, screenshot time and user sketches. Requires boardId from the user’s visual tutor prompt. No new capture.',
    inputSchema: { type: 'object', properties: { boardId: { type: 'string' } }, required: ['boardId'], additionalProperties: false },
    handler: async args => { model.require(args.boardId); const board = model.get()!; return text(JSON.stringify({ ...board, instructions: tutorPrompt(board) })); } });
  registerDeviceTool({ name: 'study_diagram', description: 'Stage or update a spacious interactive HTML/SVG Study card with images, charts, custom diagrams and local scripts/controls. Stable id updates progressively; new id adds a step. cue matches a short spoken sentence so the card follows live narration alongside native drawing and agent tools. For local images/page previews pass assets:[{id,path}] with absolute raster paths, and use <img src="ally-image:ID"> in HTML; do not paste base64 into HTML. Images are fitted automatically; original files are unchanged. Isolated card has no network/files/parent/desktop access. Read sketches with visual_tutor_read.',
    inputSchema: { type: 'object', properties: { boardId: { type: 'string' }, id: { type: 'string', maxLength: 80 }, title: { type: 'string', maxLength: 120 }, cue: { type: 'string', minLength: 4, maxLength: 300 }, html: { type: 'string', maxLength: 160000 }, height: { type: 'integer', minimum: 120, maximum: MAX_DIAGRAM_HEIGHT }, assets: { type: 'array', maxItems: MAX_DIAGRAM_IMAGES, items: { type: 'object', properties: { id: { type: 'string', maxLength: 40 }, path: { type: 'string' } }, required: ['id','path'], additionalProperties: false } } }, required: ['boardId', 'id', 'title', 'cue', 'html'], additionalProperties: false },
    handler: async args => {
      const board = model.require(args.boardId);
      if (board.presentation !== 'study' || typeof args.cue !== 'string' || args.cue.length < 4 || args.cue.length > 300) throw Error('Use the current Study session and an exact short spoken cue.');
      const images = await prepareDiagramImages(args.assets);
      const next = model.draw(board.id, { id: args.id, title: args.title, explanation: args.cue, marks: [], diagram: { html: args.html, height: args.height, images } });
      revealCue(cues.stage(String(args.id), args.cue)); publish();
      return text('Study card staged. Say its exact cue in the live drawing program to reveal it.', { boardId: next.id, steps: next.steps.length });
    } });
  registerDeviceTool({ name: 'visual_tutor_draw', description: 'Draw or update a teaching step on the user-enabled Ally overlay. Optional step.panel={x,y,width,transparent} places the compact panel in full-screen 0–1000 coordinates, clamped away from the Ally pill; transparency is optional and manual dragging remains available. Optional step.diagram={html,height} displays complex self-contained HTML/SVG with isolated local scripts and interactive controls; no network, files, parent/tool access or desktop control. No screen capture. Use 0–1000 screen-relative coordinates; same step ID replaces that step. Call visual_tutor_read to inspect user sketches.',
    inputSchema: { type: 'object', properties: { boardId: { type: 'string' }, step: { type: 'object', properties: {
      diagram: { type: 'object', properties: { html: { type: 'string', maxLength: 160000 }, height: { type: 'integer', minimum: 120, maximum: 600 } }, required: ['html'], additionalProperties: false },
      panel: { type: 'object', properties: { x: { type: 'number', minimum: 0, maximum: 1000 }, y: { type: 'number', minimum: 0, maximum: 1000 }, width: { type: 'number', minimum: 100, maximum: 1000 }, transparent: { type: 'boolean' } }, required: ['x', 'y', 'width'], additionalProperties: false },
      id: { type: 'string', maxLength: 80 }, title: { type: 'string', maxLength: 120 }, explanation: { type: 'string', maxLength: 1800 },
      marks: { type: 'array', maxItems: 80, items: { type: 'object', properties: { id: { type: 'string', maxLength: 80 }, kind: { enum: ['arrow', 'line', 'rect', 'ellipse', 'polyline', 'text'] }, color: { enum: ['mint', 'blue', 'amber', 'pink', 'white'] }, points: { type: 'array', minItems: 1, maxItems: 256, items: { type: 'object', properties: { x: { type: 'number', minimum: 0, maximum: 1000 }, y: { type: 'number', minimum: 0, maximum: 1000 } }, required: ['x', 'y'], additionalProperties: false } }, text: { type: 'string', maxLength: 240 } }, required: ['id', 'kind', 'color', 'points'], additionalProperties: false } },
    }, required: ['id', 'title', 'explanation', 'marks'], additionalProperties: false } }, required: ['boardId', 'step'], additionalProperties: false },
    handler: async args => {
      if (model.require(args.boardId).presentation === 'study') throw Error('This lesson uses live native Study annotations. Use step()/say() for screen drawing, or study_diagram for interactive cards with a spoken cue.');
      const board = model.draw(args.boardId, args.step); if (revealOnDraw) { overlay?.showInactive(); keepPillAbove(); } publish(); return text(`Displayed teaching step ${board.steps.findIndex(s => s.id === (args.step as { id: string }).id) + 1}.`, { boardId: board.id, revision: board.revision, steps: board.steps.length });
    } });
  screenReady();
  function screenReady() {
    void app.whenReady().then(() => {
      const stopIfChanged = () => { const board = model.get(); if (board && !screen.getAllDisplays().some(display => display.id === board.displayId && JSON.stringify(display.bounds) === JSON.stringify(board.bounds))) close(); };
      screen.on('display-removed', stopIfChanged);
      screen.on('display-metrics-changed', stopIfChanged);
    });
  }
  app.on('will-quit', close);
  void app.whenReady().then(() => {
    const main = getMain();
    const moved = () => {
      if (!overlay || geometryTimer) return;
      geometryTimer = setTimeout(() => {
        geometryTimer = undefined;
        // Moving the pill needs four numbers, not a clone/IPC of every diagram,
        // mark and sketch on the board.
        const bounds = main?.getBounds();
        if (bounds) overlay?.webContents.send('tutor:pill-bounds', bounds);
      }, 50);
    };
    main?.on('move', moved); main?.on('resize', moved);
    main?.on('hide', () => { const board = model.get(); if (board && board.presentation !== 'study') { revealOnDraw = false; overlay?.hide(); publish(); } });
  });
}
