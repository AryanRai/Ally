/** On-demand signatures from the bundled native engine 1.6 and pieces. */
export const NATIVE_STUDY_REFERENCES = {
  graph: {
    api: `graph(x,y,w,h,{x:[min,max],y:[min,max],ticks:true,grid:true,xLabel,yLabel}) returns g.
g.plot(fnOrArrayOfXY,{tone,samples,from,to}); g.line([x,y],[x,y],options); g.shift(series,dx,dy,options); g.cross(series,series) returns data [x,y] or null; g.point(x,y,{label,guides:true}); g.at(x,y) returns screen [x,y]. Keep ranges finite and samples <=128.`,
    example: `step(1); say("The blue curve is a sine wave.");
const lessonGraph=graph(120,180,480,250,{x:[0,6.28],y:[-1.5,1.5],ticks:true,xLabel:"t"});
const lessonWave=lessonGraph.plot(t=>sin(t),{tone:"blue",samples:64});
step(2); say("Moving it right delays the signal.");
lessonGraph.shift(lessonWave,0.8,0,{tone:"orange"});`,
  },
  timeline: {
    api: `timeline(x,y,width,[{date:numberOrString,label:string}],{slots:'above'|'below'|'alternate',tone}) returns t. t.at(date) returns screen [x,y]; t.slot(index) returns {x,y,w,h,cx,cy}. Leave room for short labels.`,
    example: `step(1); say("These are three stages of the process.");
timeline(150,350,850,[{date:0,label:"Input"},{date:1,label:"Transform"},{date:2,label:"Output"}],{slots:"alternate",tone:"blue"});`,
  },
  scene3d: {
    api: `scene3d(x,y,w,h,s=>{...},{tilt,spin,fov}) returns s.
s.sphere({r,at:[x,y,z],color}); s.box({size:[w,h,d],at,color}); s.cylinder({r,h,at,color}); s.cone({r,h}); s.torus({r,tube}); s.tube([[x,y,z],...],{r,color}); s.group(s=>{...},options); s.label(partOrXYZ,text,{side:'left'|'right'}); s.camera({turn,tilt,spin,fov}). Parts have spin({axis:'x'|'y'|'z',period:seconds}), bob({axis,amount,period}), orbit({axis,center,period}), pulse({amount,period}), path(points,{period,once:true}). Build a meaningful assembled object, not decoration.`,
    example: `step(1); say("The rotor turns above its housing.");
const lessonScene=scene3d(640,160,440,380,s=>{
  const housing=s.cylinder({r:0.7,h:1.5,color:"grey"});
  const rotor=s.box({size:[2.8,0.15,0.35],at:[0,1,0],color:"blue"});
  rotor.spin({axis:"y",period:3});
  s.label(housing,"Housing",{side:"left"});s.label(rotor,"Rotor",{side:"right"});
},{tilt:20});`,
  },
  figure: {
    api: `figure(x,y,w,h,{tilt,spin}) returns f. Build one part per statement for progressive arrival.
f.box({size:[w,h,d],at,mat}); f.sphere({r,at,mat}); f.cyl({r,h,at,mat}); f.cone(), torus(), capsule(), gear(), spring(), pipe(), lathe(), extrude(), blob(), poly(); f.arrow([[x,y,z],...],{r,mat}); f.group(options); f.label(partOrXYZ,text); f.view({turn,tilt,zoom,spin}); f.move(part,{to:[x,y,z],rot:[x,y,z],secs}).
Part options include at:[x,y,z], rotate:[degreesX,degreesY,degreesZ], scale, parent:group, cut:true or {axis:'x',at:0}, name, mat:{color,roughness,metalness,opacity}. Handles have pos,rot,scale,show,glow,color and spin/bob/orbit/pulse/path.
f.tick((seconds,deltaSeconds)=>{part.pos=[...];part.rot=[...];f.readout({Label:"value"});}) animates without timers or more model requests. Keep ticks bounded and small.`,
    example: `step(1); say("The crank rotates while the piston slides.");
const lessonMechanism=figure(650,150,460,400,{tilt:20});
const lessonCrank=lessonMechanism.cyl({r:0.5,h:0.15,mat:{color:"blue",metalness:0.5}});
const lessonPiston=lessonMechanism.box({size:[0.45,0.45,0.6],at:[0,1.2,0],mat:{color:"grey",metalness:0.7}});
lessonMechanism.label(lessonPiston,"Piston");
lessonMechanism.tick(t=>{lessonCrank.rot=[0,0,t*90];lessonPiston.pos=[0,1.2+0.6*cos(t*PI/2),0];lessonMechanism.readout({Angle:round(t*90)%360+" degrees"});});`,
  },
  cards: {
    api: `paper(x,y,w,h,{title,heading,subtitle,board:'plain'|'grid'}) returns its inner {x,y,w,h}; draw inside that area. sticky(x,y,text,color); receipt(x,y,title,items,{w}); clipping(x,y,w,title,body,source,{h}); legend(x,y,[[tone,label],...]).
For the real screen: ring(x,y,w,h,label), trace([[x,y],...],{straight:true}), connect([x,y],[x,y]), point(x,y,label), frame(x,y,w,h,label), highlight(x,y,w,h). startOver() clears the presentation in its spoken step. sfx('ding'|'whoosh'|'tada') adds a drawing sound. Do not invent search images or citations.`,
    example: `step(1); say("Here is the signal on a separate diagram card.");
const lessonCard=paper(180,150,460,340,{title:"Signal",heading:"A periodic input"});
const cardGraph=graph(lessonCard.x+30,lessonCard.y+30,lessonCard.w-70,lessonCard.h-70,{x:[0,6.28],y:[-1.5,1.5]});
cardGraph.plot(t=>sin(t),{tone:"blue",samples:64});`,
  },
} as const;

export type NativeStudyTopic = keyof typeof NATIVE_STUDY_REFERENCES;
export function nativeStudyReference(topic: unknown): string {
  if(typeof topic!=='string'||!Object.hasOwn(NATIVE_STUDY_REFERENCES,topic))throw Error('Choose graph, timeline, scene3d, figure or cards.');
  const reference=NATIVE_STUDY_REFERENCES[topic as NativeStudyTopic];
  return `${reference.api}\nExample (adapt to the question and screen dimensions):\n\`\`\`javascript\n${reference.example}\n\`\`\`\nKeep native progressive drawing and step()/say() speech. This reference does not itself display a drawing.`;
}
