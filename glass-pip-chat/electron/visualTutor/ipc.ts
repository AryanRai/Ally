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
import { studyDiagramContent } from './waveDiagram.js';
import { restoreFloatingLevel } from '../windowFloating.js';
import { chatSelection } from '../agent/selection.js';
import { studyPresentation, submitNativeStudy } from '../surface/coordinator.js';
import { StudyInputs, studyKey } from './studyInputs.js';
import { registerStudySession, registerStudyControl, StudyCues } from './studySession.js';
import { safeWindowSend } from '../safeWindowSend.js';
import { ManimJobs, type ManimJob } from '../manim/jobs.js';
import { ManimMedia } from '../manim/media.js';
import { registerManimTools } from '../manim/tools.js';
import { bindStudyCapture, studyDisplay, type StudyContext } from './studyGeometry.js';
import { StudyPlayback, type PlaybackCommand, type PlaybackState } from './playback.js';
import { mediaMayMove } from './studyMediaDisplay.js';
import { StudyLesson, parseLessonBeats, type MediaObservation } from './lesson.js';
import { playbackFollowup } from './followup.js';
import { StudyNarration } from './narration.js';
import { nativeSpeech } from '../speech/native.js';
import { googleSpeech } from '../speech/google.js';
import { speechSettings } from '../speech/settings.js';

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
  const manim = new ManimJobs({python:process.env.ALLY_MANIM_PYTHON || path.join(studyRoot,'../.local/manim/.venv/Scripts/python.exe'),renderer:path.join(app.getAppPath(),'scripts/manim/lesson.py'),root:path.join(studyRoot,'../.local/manim/renders')});
  const manimMedia = new ManimMedia();
  let turnPresented = false;
  let mediaDisplay: Electron.Display | undefined;
  const playback = new StudyPlayback();
  const lesson = new StudyLesson();
  const narration = new StudyNarration(words=>{const prefs=speechSettings();return prefs.cloud?googleSpeech(words,prefs.voice):nativeSpeech(words);});
  const fromMain = (event: IpcMainInvokeEvent) => {
    if (event.sender !== getMain()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Visual tutor must be opened from Ally');
  };
  const fromOverlay = (event: IpcMainInvokeEvent) => {
    if (event.sender !== overlay?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Invalid visual tutor surface');
  };
  const presentation = () => {
    const board = model.get(), main = getMain();
    if (board) {
      const step=board.steps[board.selected];
      if(step?.clip){board.mediaToken=lesson.current(board.id,step.id,(step.clip.src||step.clip.jobId+step.clip.state)+':'+(step.lesson?.narrationKey??''));model.require(board.id).mediaToken=board.mediaToken;}
      else lesson.invalidate();
      board.visible = !!overlay?.isVisible();
      if (panelAnchor) board.panelAnchor = { ...panelAnchor };
      const bounds = main?.getBounds();
      const view=board.presentationBounds??board.bounds;
      if (bounds) board.pillBounds = { ...bounds, x: bounds.x - view.x, y: bounds.y - view.y };
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
    if (board) { manim.revoke(board.id); manimMedia.revoke(board.id); model.end(board.id); }
    screenshot = '';
    selectionImagePath = ''; cues.reset();
    panelAnchor = undefined;
    revealOnDraw = true;
    turnPresented = false;
    mediaDisplay = undefined; playback.reset(); lesson.reset(); narration.reset();
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
    created.on('closed', () => { if (overlay === created) { overlay = null; if (model.get()?.id === board.id) { manim.revoke(board.id); manimMedia.revoke(board.id); model.end(board.id); } screenshot = ''; selectionImagePath = ''; cues.reset(); playback.reset(); lesson.reset(); narration.reset(); publish(); } });
    if (process.env.VITE_DEV_SERVER_URL) await created.loadURL(new URL('tutor.html', process.env.VITE_DEV_SERVER_URL).toString());
    else await created.loadFile(path.join(__dirname, '../../renderer/tutor.html'));
    return created;
  };
  const revealCue = (stepId: string | undefined) => {
    const board = model.get();
    if (!stepId || board?.presentation !== 'study' || !revealOnDraw || !board.following) return;
    if(mediaMayMove(board,stepId)){
      mediaDisplay ??= screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const owned=model.require(board.id);
      owned.presentationBounds={...mediaDisplay.bounds};
      overlay?.setBounds(mediaDisplay.bounds);
    }else{
      delete model.require(board.id).presentationBounds;overlay?.setBounds(board.bounds);
    }
    turnPresented = true;
    model.activate(board.id, stepId); overlay?.showInactive(); keepPillAbove(); publish();
  };
  const stageCue = (stepId: string, cue: string) => {
    cue=model.get()?.steps.find(s=>s.id===stepId)?.lesson?.cue??cue;
    const matched = cues.stage(stepId, cue);
    // The first requested card opens immediately (including render progress).
    // Later cards follow narration; hiding/reviewing the board wins this turn.
    revealCue(matched ?? (!turnPresented ? stepId : undefined));
  };
  const manimOwner = (id: unknown, caller?: string) => {
    const board = model.require(id), selected = chatSelection.snapshot().selected;
    if (board.presentation !== 'study' || !selected || board.sessionKey !== studyKey(selected)) throw Error('This Study board/chat is no longer selected.');
    if (caller && caller !== board.sessionKey && caller !== board.chatId) throw Error('This Manim board belongs to another chat.');
    return {...board,chatId:board.sessionKey || board.chatId,capacity:16-board.steps.length};
  };
  const manimUrls = new Map<string,string>();
  const manimChanged = async (job: ManimJob) => {
    let board = model.get();
    if (!board || board.id !== job.boardId || (board.sessionKey || board.chatId) !== job.chatId) return;
    for (const [index, section] of job.spec.sections.slice(job.startAt).entries()) {
      const stepId = 'manim-' + job.id + '-' + index, rendered = job.clips.find(c => c.id === section.id);
      let src: string | undefined;
      if (rendered) { src = manimUrls.get(stepId); if (!src) { src = await manimMedia.register(rendered.file, job.boardId); manimUrls.set(stepId,src); } }
      board = model.get(); if (!board || board.id !== job.boardId || (board.sessionKey || board.chatId) !== job.chatId) { manimMedia.revoke(job.boardId); return; }
      model.draw(board.id, {id:stepId,title:(job.spec.title+' ? '+section.id).slice(0,120),explanation:section.cue,marks:[],clip:{jobId:job.id,state:job.state,...(src?{src,duration:rendered!.duration}:{}),...(job.error?{error:job.error}: {})}});
      stageCue(stepId,section.cue);
    }
    publish();
  };
  manim.on('change', (job: ManimJob) => { void manimChanged(job).catch(error => console.warn('Manim presentation:', error.message)); });
  const unregisterManim = registerManimTools(manim, manimOwner);
  const controlPlayback=async(args:Record<string,unknown>,caller?:string)=>{
      manimOwner(args.boardId,caller);const board=model.require(args.boardId);
      if(typeof args.requestId!=='string'||! /^[\w.-]{1,80}$/.test(args.requestId)||!['play','pause','replay','read','seek','rate'].includes(String(args.action)))throw Error('Supply playback action and unique requestId');
      if(args.action==='seek'&&(typeof args.time!=='number'||!Number.isFinite(args.time)||args.time<0||args.time>65))throw Error('Seek time must be 0–65 seconds');
      if(args.action==='rate'&&(typeof args.rate!=='number'||!Number.isFinite(args.rate)||args.rate<.5||args.rate>2))throw Error('Playback rate must be 0.5–2');
      const step=args.stepId===undefined?board.steps[board.selected]:board.steps.find(s=>s.id===args.stepId);
      if(step?.clip?.state!=='ready')throw Error('Choose a ready animation step from visual_tutor_read');
      const command:PlaybackCommand={boardId:board.id,stepId:step.id,action:args.action as PlaybackCommand['action'],requestId:args.requestId,...(args.action==='seek'?{time:args.time as number}:{}),...(args.action==='rate'?{rate:args.rate as number}:{})};
      if(command.action==='read'&&board.steps[board.selected]?.id!==step.id)throw Error('Read the currently selected animation; play a different step to select it first');
      const state=await playback.request(command,()=>{
        board.playback=command;board.revision++;
        if(command.action==='read'){publish();return;}
        if(step.lesson)step.lesson.started=true;
        if(command.action==='replay')lesson.invalidate();
        board.selected=board.steps.indexOf(step);board.following=false;
        // An explicit playback request intentionally brings that animation back.
        if(mediaMayMove(board,step.id)){mediaDisplay=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());board.presentationBounds={...mediaDisplay.bounds};overlay?.setBounds(mediaDisplay.bounds);}
        overlay?.showInactive();keepPillAbove();publish();
      });return {boardId:board.id,stepId:step.id,...state};
  };
  const unregisterPlayback=registerDeviceTool({name:'study_playback',description:'Control the current Study animation: play, pause, replay, read, seek(time seconds), rate(rate 0.5–2). Read current position and annotations with study_lesson before explaining an arrow or repeating a section. Pause/seek/rate also control managed lesson narration. Original native speech outside the managed beat is independent. Same requestId/data returns its original receipt; never blindly retry with a new ID. Current selected Study chat ownership required.',
    inputSchema:{type:'object',properties:{boardId:{type:'string'},stepId:{type:'string'},action:{enum:['play','pause','replay','read','seek','rate']},time:{type:'number',minimum:0,maximum:65},rate:{type:'number',minimum:.5,maximum:2},requestId:{type:'string',maxLength:80}},required:['boardId','action','requestId'],additionalProperties:false},handler:async(args,ctx)=>text(JSON.stringify(await controlPlayback(args,ctx.caller)))});
  const unregisterStudyControl=registerStudyControl(async input=>{
    const action=playbackFollowup(input.words),board=model.get();
    if(!action||!board||board.sessionKey!==input.sessionKey||board.steps[board.selected]?.clip?.state!=='ready')return;
    const step=board.steps[board.selected],state=lesson.read(board.id,step.id);
    const rate='rate' in state?state.rate:board.bookmarks?.[step.id]?.rate??1;
    await controlPlayback({boardId:board.id,stepId:step.id,action:action==='slower'?'rate':action,requestId:randomUUID(),...(action==='slower'?{rate:Math.max(.5,rate-.25)}:{})},input.sessionKey);
    return '```javascript\nstep(1); say('+JSON.stringify(action==='pause'?'Paused.':action==='slower'?'Using a slower playback speed.':action==='replay'?'Replaying this section.':'Continuing this section.')+');\n```';
  });
  ipcMain.handle('tutor:playback',(event,command:PlaybackCommand)=>{fromOverlay(event);return controlPlayback(command as unknown as Record<string,unknown>);});
  ipcMain.handle('tutor:narration',(event,id:string,key:string)=>{fromOverlay(event);const board=model.require(id);if(!board.steps.some(s=>s.lesson?.narrationKey===key))throw Error('Narration is not part of this board');return narration.read(id,key);});
  ipcMain.handle('tutor:review',(event,id:string,stepId:string)=>{
    fromOverlay(event);const board=model.require(id);const index=board.steps.findIndex(s=>s.id===stepId);if(index<0)throw Error('Unknown review step');
    board.selected=index;board.following=false;board.revision++;lesson.invalidate();publish();
  });
  ipcMain.handle('tutor:playback-ack',(event,command:PlaybackCommand,state:PlaybackState)=>{
    fromOverlay(event);if(playback.acknowledge(command,state)){const board=model.get();if(board?.id===command.boardId){delete model.require(board.id).playback;publish();}}
  });
  ipcMain.on('tutor:media-state',(event,state:MediaObservation)=>{
    if(event.sender!==overlay?.webContents||event.senderFrame!==event.sender.mainFrame)return;
    // High-frequency player events need no full clone of HTML/cards/sketches.
    let board:TutorBoard;try{board=model.require(state?.boardId);}catch{return;}
    const step=board.steps[board.selected];
    if(step?.id===state.stepId&&step.clip&&lesson.observe(state)&&state.duration>0&&state.pixels.width>0){
      board.bookmarks??={};board.bookmarks[step.id]={time:state.currentTime,rate:state.rate,...(state.narration?{narrationTime:state.narration.time}:{})};
    }
  });
  const unregisterLesson=registerDeviceTool({name:'study_lesson',description:'Coordinate existing Study animation steps with native speech cues and video-relative pointing/writing. stage beats with stable id, stepId from visual_tutor_read, exact say() cue, mode alongside or wait, optional annotations in video-relative 0–1000 coordinates. Staged clips wait for their actual native caption. For wait mode: emit cue, then call wait before producing subsequent narration; advance only when status is ended. wait is bounded to15s and reports actual player state, not a timer estimate. read returns lesson/current playback and current on-screen video bounds. No OS cursor/click control. Ownership remains the selected Study chat.',
    inputSchema:{type:'object',properties:{boardId:{type:'string'},action:{enum:['stage','read','wait']},requestId:{type:'string',maxLength:80},stepId:{type:'string'},beats:{type:'array',minItems:1,maxItems:16,items:{type:'object',properties:{id:{type:'string'},stepId:{type:'string'},cue:{type:'string'},narration:{type:'string',maxLength:1000},mode:{enum:['alongside','wait']},annotations:{type:'array',maxItems:24,items:{type:'object',properties:{id:{type:'string'},kind:{enum:['pointer','arrow','highlight','text']},x:{type:'number'},y:{type:'number'},x2:{type:'number'},y2:{type:'number'},width:{type:'number'},height:{type:'number'},text:{type:'string'},tone:{enum:['ink','grey','orange','blue','green','red']},at:{type:'number'},until:{type:'number'},travel:{type:'number'},write:{type:'boolean'}},required:['id','kind','x','y'],additionalProperties:false}}},required:['id','stepId','cue'],additionalProperties:false}}},required:['boardId','action'],additionalProperties:false},
    handler:async(args,ctx)=>{
      manimOwner(args.boardId,ctx.caller);const board=model.require(args.boardId);
      if(args.action==='stage'){
        if(typeof args.requestId!=='string'||! /^[\w.-]{1,80}$/.test(args.requestId))throw Error('Supply unique lesson requestId');
        const beats=parseLessonBeats(args.beats);
        for(const beat of beats)if(!board.steps.some(s=>s.id===beat.stepId&&s.clip))throw Error('Lesson beat needs an existing animation step');
        const signature=JSON.stringify({boardId:board.id,beats});
          for(const beat of beats)if(beat.narration)beat.narrationKey=await narration.prepare(board.id,beat.narration);
          manimOwner(board.id,ctx.caller);if(model.require(board.id)!==board)throw Error('Study board changed');
          const result=lesson.stage(args.requestId,signature,()=>{
          for(const beat of beats){const step=board.steps.find(s=>s.id===beat.stepId)!;beat.started=(step.lesson?.cue===beat.cue&&step.lesson.started)||!!cues.stage(step.id,beat.cue);step.lesson=beat;if(beat.started)revealCue(step.id);}
          board.revision++;publish();return{boardId:board.id,staged:beats.map(b=>({id:b.id,stepId:b.stepId,mode:b.mode})),instruction:'Emit exact cue, then for wait mode call study_lesson wait before generating later narration. Only status ended confirms completion.'};
        });return text(JSON.stringify(result));
      }
      const step=args.stepId===undefined?board.steps[board.selected]:board.steps.find(s=>s.id===args.stepId);
      if(!step?.clip)throw Error('Choose an animation step from visual_tutor_read');
      if(args.action==='wait')return text(JSON.stringify(await lesson.wait(board.id,step.id,15000,ctx.signal)));
      if(args.action!=='read')throw Error('Unknown lesson action');
      const state=lesson.read(board.id,step.id),view=overlay?.getBounds();
      const bounds='bounds' in state&&state.bounds&&view?{x:state.bounds.x+view.x,y:state.bounds.y+view.y,width:state.bounds.width,height:state.bounds.height}:undefined;
      const rounded=bounds&&{x:Math.round(bounds.x),y:Math.round(bounds.y),width:Math.round(bounds.width),height:Math.round(bounds.height)};
      return text(JSON.stringify({boardId:board.id,stepId:step.id,beat:step.lesson,state,...(bounds?{videoBoundsDIP:bounds,videoBoundsPixels:process.platform==='win32'?screen.dipToScreenRect(null,rounded!):bounds}:{}),beats:board.steps.filter(s=>s.lesson).map(s=>({id:s.lesson!.id,stepId:s.id,cue:s.lesson!.cue,mode:s.lesson!.mode,started:s.lesson!.started}))}));
    }});
  ipcMain.handle('tutor:manim-cancel', async (event, id: string, jobId: string) => { fromOverlay(event); const board = manimOwner(id); manim.cancel(jobId,board.id,board.chatId); });
  ipcMain.handle('tutor:manim-load', async (event, id: string, src: unknown) => {
    fromOverlay(event);
    const board = model.require(id);
    if (!board.steps.some(step => step.clip?.state === 'ready' && step.clip.src === src)) throw Error('Unknown clip on this Study board');
    return manimMedia.read(src, board.id);
  });
  app.once('will-quit', () => { unregisterManim(); unregisterPlayback(); unregisterLesson(); unregisterStudyControl(); playback.reset(); lesson.reset(); narration.reset(); manim.close(); manimMedia.close(); });
  const caption = (words: string) => {const stepId=cues.hear(words);const board=model.get();if(stepId&&board?.following&&revealOnDraw){const step=model.require(board.id).steps.find(s=>s.id===stepId);if(step?.lesson)step.lesson.started=true;}revealCue(stepId);};
  studyPresentation.on('caption', caption);
  const unregisterStudy = registerStudySession(async input => {
    let context: StudyContext = {};
    try { context = JSON.parse(input.context); } catch { /* Legacy context has no geometry. */ }
    let board = model.get();
    if (!board || (board.sessionKey !== input.sessionKey && board.chatId !== input.chatId)) {
      close();
      const display = studyDisplay(context, screen.getAllDisplays(), () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()));
      const width = context.screenshot?.widthInPixels, height = context.screenshot?.heightInPixels;
      const screenPixels = { width: typeof width === 'number' && width > 0 && Number.isFinite(width) ? width : Math.round(display.bounds.width * display.scaleFactor), height: typeof height === 'number' && height > 0 && Number.isFinite(height) ? height : Math.round(display.bounds.height * display.scaleFactor) };
      board = { id: randomUUID(), chatId: input.chatId, sessionKey: input.sessionKey, presentation: 'study', screenPixels, displayId: display.id, bounds: { ...display.bounds }, capturedAt: context.selection?.capturedAt ?? Date.now(), steps: [], sketches: [], selected: 0, following: true, sketching: false, frozen: false, revision: 0 };
      bindStudyCapture(board, context, input.imagePath, screen.getAllDisplays(), bounds => process.platform === 'win32' ? screen.dipToScreenRect(null, bounds) : bounds);
      model.start(board); await openOverlay(board);
    } else if (board.sessionKey !== input.sessionKey) { board.sessionKey = input.sessionKey; model.start(board); }
    // An explicit new Study turn resumes live presentation, without changing
    // the user's selected step or sketches until new narration actually arrives.
    cues.reset(); revealOnDraw = true; turnPresented = false; mediaDisplay=undefined;
    const imagePath = bindStudyCapture(board, context, input.imagePath, screen.getAllDisplays(), bounds => process.platform === 'win32' ? screen.dipToScreenRect(null, bounds) : bounds);
    board.following = true; model.start(board);
    selectionImagePath = imagePath;
    publish();
    return `Shared Study board: ${board.id}. For interactive HTML/SVG cards use ally_chats study_diagram with this boardId. Built-in preset waves or fourier provides responsive local controls without writing html; native_study_reference(topic: waves) explains it. cue must exactly match a short say() sentence: the card appears on that spoken caption. Update a stable id incrementally; new id means next step. Start a short spoken beat before building a large diagram. visual_tutor_read includes user sketches. For Manim animation clips use study_manim; read native_study_reference(topic: manim), keep native live feedback while queued, and use exact section cues in say(). For synchronized pointer/writing and watch-then-explain beats use study_lesson; read native_study_reference(topic: lesson). Keep screen annotations in native step()/say(), and actions in agent tools.`;
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
      case 'chat': revealOnDraw = false; if (model.get()?.sketching) model.toggle(id, 'sketching'); overlay?.hide(); if (getMain()?.isVisible()) { getMain()?.focus(); getMain()?.webContents.send('focus-main-input'); } publish(); return;
      case 'previous': case 'next': case 'latest': model.select(id, action); break;
      case 'sketch': case 'freeze': {
        const source=model.require(id);delete source.presentationBounds;overlay?.setBounds(source.bounds);
        model.toggle(id, action==='sketch'?'sketching':'frozen');break;
      }
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
  registerDeviceTool({ name: 'study_diagram', description: 'Stage or update a spacious interactive HTML/SVG Study card with images, charts, custom diagrams and local scripts/controls. Stable id updates progressively; new id adds a step. cue matches a short spoken sentence so the card follows live narration alongside native drawing and agent tools. For interactive wave/phase controls use preset:waves; for harmonic sums use preset:fourier, omitting html. For local images/page previews pass assets:[{id,path}] with absolute raster paths, and use <img src="ally-image:ID"> in HTML; do not paste base64 into HTML. Images are fitted automatically; original files are unchanged. Isolated card has no network/files/parent/desktop access. Read sketches with visual_tutor_read.',
    // Claude forbids root schema unions. studyDiagramContent enforces exactly
    // one of html/preset before any image preparation or board mutation.
    inputSchema: { type: 'object', properties: { boardId: { type: 'string' }, id: { type: 'string', maxLength: 80 }, title: { type: 'string', maxLength: 120 }, cue: { type: 'string', minLength: 4, maxLength: 300 }, html: { type: 'string', maxLength: 160000 }, preset: { type: 'string', enum: ['waves', 'fourier'] }, height: { type: 'integer', minimum: 120, maximum: MAX_DIAGRAM_HEIGHT }, assets: { type: 'array', maxItems: MAX_DIAGRAM_IMAGES, items: { type: 'object', properties: { id: { type: 'string', maxLength: 40 }, path: { type: 'string' } }, required: ['id','path'], additionalProperties: false } } }, required: ['boardId', 'id', 'title', 'cue'], additionalProperties: false },
    handler: async args => {
      const board = model.require(args.boardId);
      if (board.presentation !== 'study' || typeof args.cue !== 'string' || args.cue.length < 4 || args.cue.length > 300) throw Error('Use the current Study session and an exact short spoken cue.');
      const html = studyDiagramContent(args);
      const images = await prepareDiagramImages(args.assets);
      const next = model.draw(board.id, { id: args.id, title: args.title, explanation: args.cue, marks: [], diagram: { html, height: args.height ?? (args.preset ? 620 : undefined), images } });
      stageCue(String(args.id), args.cue); publish();
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
      const stopIfChanged = () => { const board = model.get(),displays=screen.getAllDisplays(); if (board && (!displays.some(display => display.id === board.displayId && JSON.stringify(display.bounds) === JSON.stringify(board.bounds)) || (board.presentationBounds&&!displays.some(display=>JSON.stringify(display.bounds)===JSON.stringify(board.presentationBounds))))) close(); };
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


