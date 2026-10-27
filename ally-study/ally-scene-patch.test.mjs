import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patchSceneEngine, patchSceneNative } from './ally-scene-patch.mjs';

const base = new URL('./client/Assets/Engine/', import.meta.url);
const baseline = new URL('clicky-draw-engine.js.scene-baseline', base);
const source = fs.readFileSync(fs.existsSync(baseline) ? baseline : new URL('clicky-draw-engine.js', base), 'utf8');
function fixture() {
  let now = 0; const timers = new Map(), logs = [];
  const host = { now:() => now, schedule:(id, seconds) => timers.set(id, now+seconds), cancel:id => timers.delete(id), log:s => logs.push(s),
    caption:() => {}, inkFor:() => '#ffffff', textWidth:(_f,s,_w,t) => t.length*s*0.55,
    textBox:json => { const d=JSON.parse(json); return [d.x,d.y-20,Math.max(...d.lines.map(l=>l.text.length))*12,22]; },
    // Conservative control-point bounds for the absolute SVG paths in this fixture.
    pathBox:d => {const n=(d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)||[]).map(Number),x=n.filter((_,i)=>i%2===0),y=n.filter((_,i)=>i%2===1);return n.length?[Math.min(...x),Math.min(...y),Math.max(...x)-Math.min(...x),Math.max(...y)-Math.min(...y)]:[0,0,0,0];}, pathLength:() => 150, pathPoint:() => [0,0] };
  const ctx=vm.createContext({__host:host});
  vm.runInContext(patchSceneEngine(source),ctx);
  vm.runInContext(patchSceneNative(fs.readFileSync(new URL('clicky-draw-native.js',base),'utf8')),ctx);
  const canvas=ctx.clickyCanvas;
  function pump(){let count=0;while(timers.size){if(++count>30000)throw Error('Unbounded timers');const [id,t]=[...timers].sort((a,b)=>a[1]-b[1])[0];timers.delete(id);now=Math.max(now,t);ctx.__fireTimer(id);} }
  function read(){const raw=canvas.state();assert.ok(raw,'Expected native scene state');return JSON.parse(raw.split('Editable native scene (data): ')[1]);}
  function state(){const {results,...scene}=read();return scene;}
  function start(code){canvas.beginStream({w:1280,h:720,width:1280,subtitles:false});canvas.feed({code,done:true});canvas.line(0);canvas.lineLength(0,0.1);canvas.finish();pump();return state();}
  function turn(code){const next=JSON.parse(canvas.continueStream({}));canvas.feed({code,done:true});canvas.line(next.firstLine);canvas.lineLength(next.firstLine,0.1);canvas.finish();pump();return state();}
  return {ctx,canvas,pump,state,read,start,turn,logs,drain:()=>JSON.parse(ctx.__drainRender()||'[]')};
}
const bind = {op:'bind',boardId:'bridge-lesson-unique',revision:0,requestId:'bind-1'};
const command=(q)=>'sceneEdit('+JSON.stringify(q)+');';
const initial=`step(1);say("Here is the bridge and car.");
rect(100,380,1000,15,{tone:"grey"});
line([[260,380],[260,170],[1000,170],[1000,380]],{tone:"grey"});
rect(610,350,80,30,{tone:"green",fill:"green"});
circle(625,385,10,{tone:"grey"});circle(675,385,10,{tone:"grey"});
arrow([[650,365],[650,455]],{tone:"orange"});text(675,440,"Weight",{tone:"orange"});
${command(bind)}
${command({op:'group',boardId:bind.boardId,revision:1,requestId:'car-group',name:'car',ids:['m2','m3','m4','m5','m6']})}`;
const op=(operation,revision,requestId,fields={})=>({op:operation,boardId:bind.boardId,revision,requestId,...fields});

test('patch is idempotent and refuses an unexpected upstream engine',()=>{
  const result=patchSceneEngine(source);assert.equal(patchSceneEngine(result),result);
  assert.throws(()=>patchSceneEngine('unknown'),/anchor mismatch/);
});
test('native runner captures guarded editing marks',()=>{
  const f=fixture(); const r=f.ctx.ClickyDraw.runCode(initial,1280,720);
  assert.equal(r.error,null); assert.ok(r.some(m=>m.do==='edit'&&m.op.op==='allyScene'));
});
test('bridge group moves across a native follow-up without changing bridge marks',()=>{
  const f=fixture();const before=f.start(initial);assert.equal(before.revision,2);
  const moved=f.turn('step(1);say("The car moves to the left tower.");'+command(op('move',2,'move-car',{id:'car',dx:-350,dy:0})));
  assert.equal(moved.revision,3);
  assert.deepEqual(moved.groups.car,[2,3,4,5,6]);
  for(const i of [0,1])assert.deepEqual(moved.objects[i],before.objects[i]);
  for(const i of [2,3,4,5,6])assert.deepEqual(moved.objects[i].geometry.__xf,[1,-350,0]);
});
test('label, arrow, recolor, hide/show, delete and undo/redo preserve unrelated ink',()=>{
  const f=fixture();const before=f.start(initial);let revision=2;
  const edit=(operation,fields={})=>f.turn('step(1);say("Update this part.");'+command(op(operation,revision++,'edit-'+revision,fields)));
  let s=edit('update',{id:'m6',patch:{text:'Weight = mg'}});assert.equal(s.objects[6].geometry.text,'Weight = mg');
  s=edit('update',{id:'m5',patch:{pts:[[650,365],[650,520]]}});assert.equal(s.objects[5].geometry.pts[1][1],520);
  s=edit('recolor',{id:'m1',color:'blue'});assert.equal(s.objects[1].geometry.tone,'blue');
  s=edit('hide',{id:'car'});assert.equal(s.objects[2].visible,false);
  s=edit('show',{id:'car'});assert.equal(s.objects[2].visible,true);
  s=edit('delete',{id:'m6'});assert.equal(s.objects[6].deleted,true);
  s=edit('undo');assert.equal(s.objects[6].deleted,false);assert.equal(s.objects[6].geometry.text,'Weight = mg');
  s=edit('redo');assert.equal(s.objects[6].deleted,true);
  assert.deepEqual(s.objects[0],before.objects[0]);
});
test('wrong board, stale revision, mixed invalid IDs and conflicting retry change nothing',()=>{
  const f=fixture();let s=f.start(initial);
  const attempt=q=>f.turn('step(1);say("Attempt a guarded edit.");'+command(q));
  for(const q of [op('move',0,'stale',{id:'car',dx:5,dy:0}),{...op('hide',2,'wrong',{id:'car'}),boardId:'another-board'},op('hide',2,'bad-id',{ids:['m2','m9999']}),op('update',2,'bad-patch',{ids:['m2','m6'],patch:{text:'No'}})]){
    const next=attempt(q);assert.deepEqual(next,s);
  }
  const q=op('move',2,'retry',{id:'car',dx:-20,dy:0});s=attempt(q);const retry=attempt(q);assert.deepEqual(retry,s);
  assert.equal(s.revision,3);assert.deepEqual(s.objects[2].geometry.__xf,[1,-20,0]);
  assert.deepEqual(attempt({...q,dx:50}),s);
  assert.match(f.read().results.at(-1).error,/reused/);
});
test('edits wait for their spoken line and emit native diffs for only the targeted group',()=>{
  const f=fixture();f.start(initial);const original=f.drain();
  const unchanged=new Set();const visit=n=>{if(n.k===0||n.k===1)unchanged.add(n.n);for(const c of n.ch||[])visit(c);};
  original.filter(o=>o.node).forEach(o=>visit(o.node));assert.ok(unchanged.size);
  const next=JSON.parse(f.canvas.continueStream({}));
  f.canvas.feed({code:'step(1);say("Now move the car.");'+command(op('move',2,'cued',{id:'car',dx:-40,dy:0})),done:true});
  f.pump();assert.equal(f.state().revision,2);
  f.canvas.line(next.firstLine);f.canvas.lineLength(next.firstLine,0.1);f.canvas.finish();f.pump();
  assert.equal(f.state().revision,3);
  const changes=f.drain();assert.ok(changes.some(o=>o.op==='motion'||o.op==='wrap'));
  for(const change of changes){assert.ok(!unchanged.has(change.n));if(change.node)assert.ok(!unchanged.has(change.node.n));}
});
test('mixed invalid geometry is atomic and a new edit clears redo',()=>{
  const f=fixture();let state=f.start(initial);
  const edit=q=>f.turn('step(1);say("Edit the scene.");'+command(q));
  assert.deepEqual(edit(op('update',2,'atomic',{ids:['m2','m6'],patch:{at:[300,300],r:5}})),state);
  edit(op('hide',2,'hide',{id:'car'}));edit(op('undo',3,'undo'));state=edit(op('recolor',4,'color',{id:'m2',color:'red'}));
  assert.equal(state.redo,0);assert.deepEqual(edit(op('redo',5,'empty-redo')),state);
});
test('native full-program replay rebuilds the same guarded scene and readback',()=>{
  const f=fixture();f.start(initial);
  const next=JSON.parse(f.canvas.continueStream({}));
  const code='step(1);say("Move it.");'+command(op('move',2,'replay-move',{id:'car',dx:-350,dy:0}));
  f.canvas.feed({code,done:true});f.canvas.line(next.firstLine);f.canvas.finish();f.pump();const live=f.state();
  const replay=fixture();replay.canvas.renderWhole({w:1280,h:720,width:1280,code:next.code+'\n'+code});replay.pump();
  assert.deepEqual(replay.state(),live);
});
test('hiding every mark retains board readback so a follow-up can show or undo it',()=>{
  const f=fixture();f.start(initial);
  let s=f.turn('step(1);say("Temporarily hide this diagram.");'+command(op('hide',2,'hide-all',{ids:['m0','m1','car']})));
  assert.ok(s.objects.every(o=>!o.visible));assert.equal(s.boardId,bind.boardId);
  s=f.turn('step(1);say("Restore it.");'+command(op('undo',3,'undo-hide-all')));
  assert.ok(s.objects.every(o=>o.visible));
});
