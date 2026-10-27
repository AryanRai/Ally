// Offline interoperability, including the actual native pieces and animation callbacks.
// Requires the private runtime; does not open windows or contact a model/voice service.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
  const {NATIVE_STUDY_REFERENCES}=await import('../../glass-pip-chat/electron/watch/nativeStudyReference.ts');
  const assets=path.join(__dirname,'../client/Assets/Engine');
  const context=vm.createContext({console});
  vm.runInContext(fs.readFileSync(path.join(assets,'clicky-draw-engine.js'),'utf8'),context,{timeout:5000});
  const pieces=fs.readFileSync(path.join(assets,'clicky-draw-pieces.js'),'utf8');
  const tutorial=`
step(1);say("First I can mark a real area of the screen.");ring(90,60,240,50);trace([[80,150],[300,150],[300,260],[80,260],[80,150]],{straight:true});
step(2);say("Then I point, connect and highlight the important part.");connect([110,180],[440,220]);point(440,220,"Here");highlight(100,280,280,32);
step(3);startOver();say("Now let us look at three separate diagrams.");
const cardA=paper(60,180,300,360,{title:"Signal"});const cardB=paper(460,180,300,360,{title:"Process"});const cardC=paper(860,180,300,360,{title:"Turbine"});
const signalGraph=graph(cardA.x+20,cardA.y+50,cardA.w-40,180,{x:[0,6.28],y:[-1.5,1.5]});signalGraph.plot(t=>sin(t),{tone:"blue"});
timeline(cardB.x+10,cardB.y+150,cardB.w-20,[{date:0,label:"In"},{date:1,label:"Work"},{date:2,label:"Out"}]);
step(4);say("The compressor blades turn as air flows through the engine.");
const turbine=figure(cardC.x,cardC.y,cardC.w,cardC.h,{tilt:20});
const shaft=turbine.cyl({r:0.15,h:3.2,rotate:[90,0,0],mat:{color:"grey",metalness:0.8}});
const compressor=turbine.group({at:[0,0,-0.8]});
const fan=turbine.group({at:[0,0,0.8]});
for(let k=0;k<16;k++){const a=k*2*PI/16;turbine.box({size:[0.15,0.8,0.15],at:[0.6*cos(a),0.6*sin(a),0],rotate:[0,0,k*360/16],parent:compressor,mat:{color:"blue",metalness:0.7}});turbine.box({size:[0.15,0.9,0.15],at:[0.65*cos(a),0.65*sin(a),0],rotate:[0,0,k*360/16],parent:fan,mat:{color:"orange",metalness:0.7}});}
turbine.label(shaft,"Shaft");turbine.label(compressor,"Compressor");turbine.label(fan,"Fan");
turbine.tick(t=>{compressor.rot=[0,0,t*100];fan.rot=[0,0,-t*80];turbine.readout({RPM:1200});});
step(5);say("The same drawing remains live as I explain it.");sfx("ding");
`;
  const cases={...Object.fromEntries(Object.entries(NATIVE_STUDY_REFERENCES).map(([key,value])=>[key,value.example])),originalTutorialCapabilities:tutorial};
  const results=[];
  for(const [name,program] of Object.entries(cases)){
    context.program=pieces+'\n;\n'+program;
    const started=performance.now();
    const marks=vm.runInContext('ClickyDraw.runCode(program,1280,720,{budgetMs:1000})',context,{timeout:3000});
    assert.equal(marks.error,null,name);assert.ok(marks.length>0,name);assert.ok(marks.says.length>0,name);
    const session=vm.runInContext('ClickyDraw.Session(1280,720,{budgetMs:1000})',context);
    const emitted=[];
    for(let end=137;end<context.program.length;end+=137){const partial=session.update(context.program.slice(0,end),false);emitted.push(...partial.marks);}
    const final=session.update(context.program,true);emitted.push(...final.marks);
    assert.equal(final.error,null,name);assert.equal(emitted.length,marks.length,name+' has no streamed mark replay');
    const ticks=Object.values(marks.live3d.ticks);
    for(const tick of ticks){tick(0,1/60);tick(1,1/60);}
    if(name==='originalTutorialCapabilities'){
      assert.ok(marks.filter(mark=>mark.do==='part3d').length>=35);
      for(const role of ['point','connect'])assert.ok(marks.some(mark=>mark.role===role),role);
      assert.ok(marks.some(mark=>mark.do==='edit'&&mark.edit?.op==='startOver')||marks.some(mark=>mark.do==='edit'));
      assert.ok(ticks.length>0);
    }
    results.push({name,marks:marks.length,speechCues:marks.says.length,animationCallbacks:ticks.length,elapsedMs:Math.round(performance.now()-started),warnings:Array.from(marks.warnings)});
  }
  console.log(JSON.stringify({engine:context.ClickyDraw.version,cases:results,nativeWindowPlaybackVerified:false},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
