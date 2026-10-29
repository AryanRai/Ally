import { registerDeviceTool } from '../chatsMcp/index.js';
import { text } from '../chatsMcp/protocol.js';
import { ManimJobs, type ManimJob } from './jobs.js';
import { nativeToManim } from './spec.js';
import { nativeSceneEdits } from './sceneBridge.js';
export function registerManimTools(jobs:ManimJobs,board:(id:unknown,caller?:string)=>{id:string;chatId:string;sessionKey?:string;capacity?:number}){
  return registerDeviceTool({name:'study_manim',description:'Render a bounded Manim Community lesson in the current Study board without blocking live native drawing. Actions: start with spec; read status/spec; cancel; followup with ready jobId, expectedRevision and new sections to edit named objects. Presets fourier, phasor, bridge, mechanism or custom scene. Native scene import accepts observed nativeScene+width+height. Read native_study_reference(topic:manim) first. native_edits exports guarded native sceneEdit code for supported imported 2D final frames using observed nativeScene; it does not execute ink. No raw Python. Clips are caption-cued; queued/rendering does not mean displayed. Reuse requestId to retry a start safely.',
    inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','read','wait','cancel','followup','native_edits']},boardId:{type:'string'},requestId:{type:'string',maxLength:80},jobId:{type:'string'},sectionId:{type:'string'},expectedRevision:{type:'integer'},spec:{type:'object'},parameters:{type:'object',properties:{terms:{type:'integer'},amplitude:{type:'number'},frequency:{type:'number'},phase:{type:'number'}},additionalProperties:false},sections:{type:'array'},nativeScene:{type:'object'},width:{type:'number'},height:{type:'number'}},required:['action','boardId'],additionalProperties:false},
    handler:async(args,ctx)=>{
      const owner=board(args.boardId,ctx.caller);let job:ManimJob;
      if(args.action==='native_edits'){
        if(typeof args.jobId!=='string'||typeof args.requestId!=='string'||typeof args.sectionId!=='string')throw Error('Supply jobId, sectionId, expectedRevision, requestId and observed nativeScene');
        const base=jobs.read(args.jobId,owner.id,owner.chatId),state=base.sceneStates?.[args.sectionId];
        if(base.state!=='ready'||base.revision!==args.expectedRevision||!state)throw Error('Read a ready scene with final geometry and its exact revision/section ID');
        return text(JSON.stringify(nativeSceneEdits(base.spec,state,args.nativeScene,args.requestId)));
      }
      if(args.action==='read'||args.action==='cancel'||args.action==='wait'){
        if(typeof args.jobId!=='string')throw Error('Supply jobId');job=args.action==='wait'?await jobs.wait(args.jobId,owner.id,owner.chatId,15000,ctx.signal):args.action==='read'?jobs.read(args.jobId,owner.id,owner.chatId):jobs.cancel(args.jobId,owner.id,owner.chatId);
      }else{
        if(typeof args.requestId!=='string'||!/^[\w.-]{1,80}$/.test(args.requestId))throw Error('Supply unique requestId');
        let spec=args.spec;
        if(args.action==='followup'){
          if(typeof args.jobId!=='string'||typeof args.expectedRevision!=='number')throw Error('Read a ready job and supply its revision.');
          const base=jobs.read(args.jobId,owner.id,owner.chatId);const parameters=args.parameters&&typeof args.parameters==='object'&&!Array.isArray(args.parameters)?args.parameters as Record<string,unknown>:{};spec={...base.spec,...Object.fromEntries(Object.entries(parameters).filter(([key])=>['terms','amplitude','frequency','phase'].includes(key))),sections:args.sections};
        }else if(args.action!=='start')throw Error('Unknown Manim action');
        if(args.nativeScene!==undefined){if(args.action!=='start')throw Error('Native import starts a new render.');spec={...(spec as object),preset:'scene',...nativeToManim(args.nativeScene,Number(args.width),Number(args.height))};}
        job=jobs.start(owner.id,owner.chatId,spec,args.action==='followup'?String(args.jobId):undefined,args.expectedRevision as number|undefined,args.requestId,owner.capacity);
      }
      const {clips,sceneStates,...publicJob}=job;return text(JSON.stringify({...publicJob,editableSections:Object.keys(sceneStates??{}),clips:clips.map(({file,...clip})=>clip),notice:job.state==='ready'?'Rendered clips ready; appearance follows spoken cues or manual step review.':'This is render status, not proof of playback.'}));
    }});
}
