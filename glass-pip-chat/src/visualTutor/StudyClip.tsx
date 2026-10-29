import { useEffect, useRef, useState } from 'react';
import type { StudyClip as Clip } from '../../electron/visualTutor/types';
import type { PlaybackCommand,PlaybackState,PlaybackBookmark } from '../../electron/visualTutor/playback';
import type {LessonBeat,MediaObservation} from '../../electron/visualTutor/lesson';
import MediaAnnotations from './MediaAnnotations';
import {mediaContentRect} from './mediaGeometry';
export default function StudyClip({clip,onCancel,loadClip,loadNarration,command,onPlayback,lesson,mediaIdentity,onMedia,layoutKey,bookmark,review=false,active=true}:{clip:Clip;onCancel:()=>void;loadClip:(src:string)=>Promise<Uint8Array>;loadNarration?:(key:string)=>Promise<Uint8Array>;command?:PlaybackCommand;onPlayback?:(command:PlaybackCommand,state:PlaybackState)=>void;lesson?:LessonBeat;mediaIdentity?:{boardId:string;stepId:string;token:string};onMedia?:(state:MediaObservation)=>void;layoutKey?:string;bookmark?:PlaybackBookmark;review?:boolean;active?:boolean}){
  const video=useRef<HTMLVideoElement>(null),[speed,setSpeed]=useState(1),[failure,setFailure]=useState('');
  const [src,setSrc]=useState(''),[attempt,setAttempt]=useState(0);
  const manuallyPaused=useRef(review),restored=useRef(false),saved=useRef(bookmark);
  const audio=useRef<HTMLAudioElement>(null),[narrationSrc,setNarrationSrc]=useState(''),loadedNarrationKey=useRef('');
  const narrationLoader=useRef(loadNarration);narrationLoader.current=loadNarration;
  useEffect(()=>{
    let disposed=false,url='';const player=audio.current;loadedNarrationKey.current='';setNarrationSrc('');
    if(lesson?.narrationKey)void narrationLoader.current?.(lesson.narrationKey).then(bytes=>{if(disposed)return;url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'audio/wav'}));setNarrationSrc(url);}).catch(error=>{if(!disposed)setFailure(`Narration unavailable: ${error.message}`);});
    return()=>{disposed=true;player?.pause();if(url)URL.revokeObjectURL(url);};
  },[lesson?.narrationKey]);
  const handled=useRef(''),ack=useRef(onPlayback);ack.current=onPlayback;
  const pendingCommand=useRef(command);pendingCommand.current=command;
  const reportMedia=useRef(onMedia);reportMedia.current=onMedia;
  const enabled=active&&(!lesson||lesson.started)&&(!lesson?.narrationKey||!!narrationSrc);
  const [mediaTime,setMediaTime]=useState(0),[mediaRect,setMediaRect]=useState({x:0,y:0,width:0,height:0});
  const loader=useRef(loadClip);loader.current=loadClip;
  useEffect(()=>{
    let disposed=false,url='';const player=video.current;
    setFailure('');setSrc('');manuallyPaused.current=review;restored.current=false;
    if(clip.state==='ready'&&clip.src)void loader.current(clip.src).then(bytes=>{
      if(disposed)return;
      url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'video/mp4'}));setSrc(url);
    }).catch(error=>{if(!disposed)setFailure(`Could not load animation: ${error.message || error}`);});
    return()=>{disposed=true;player?.pause();audio.current?.pause();if(url)URL.revokeObjectURL(url);};
  },[clip.src,clip.state,attempt]);
  useEffect(()=>{
    const player=video.current;if(!player||!src)return;
    // A hidden window can finish loading before its cue. Changing autoplay's
    // attribute after that does not reliably start Chromium playback.
    const sync=()=>{if(!enabled||document.hidden){player.pause();audio.current?.pause();}else if(!manuallyPaused.current)void player.play().catch(()=>{});};
    sync();document.addEventListener('visibilitychange',sync);
    return()=>document.removeEventListener('visibilitychange',sync);
  },[enabled,src]);
  useEffect(()=>{
    const player=video.current;if(!player||!src)return;let last=0;
    const update=(event?:Event)=>{
      if(lesson?.narrationKey&&loadedNarrationKey.current!==lesson.narrationKey)return;
      const pending=pendingCommand.current;
      if(pending?.action==='replay'&&handled.current!==pending.requestId)return;
      const now=performance.now();if(event?.type==='timeupdate'&&now-last<150)return;last=now;
      const box=player.getBoundingClientRect(),fit=mediaContentRect(box.width,box.height,player.videoWidth,player.videoHeight);
      setMediaTime(player.currentTime||0);setMediaRect(prior=>JSON.stringify(prior)===JSON.stringify(fit)?prior:fit);
      const voice=audio.current,hasVoice=!!lesson?.narrationKey;
      if(mediaIdentity)reportMedia.current?.({...mediaIdentity,paused:player.paused&&(!hasVoice||!!voice?.paused),ended:player.ended&&(!hasVoice||!!voice?.ended),currentTime:Math.max(0,player.currentTime||0),duration:Number.isFinite(player.duration)?player.duration:0,rate:player.playbackRate,...(hasVoice&&voice?{narration:{time:voice.currentTime,duration:Number.isFinite(voice.duration)?voice.duration:0,paused:voice.paused,ended:voice.ended}}:{}),bounds:{x:box.x+fit.x,y:box.y+fit.y,width:fit.width,height:fit.height},pixels:{width:player.videoWidth,height:player.videoHeight},...((player.error||voice?.error)?{error:(player.error||voice?.error)!.message}:{})});
    };
    const events=['loadedmetadata','canplay','timeupdate','play','pause','ended','seeked','ratechange','error'];for(const name of events){player.addEventListener(name,update);audio.current?.addEventListener(name,update);}
    const observer=new ResizeObserver(()=>update());observer.observe(player);update();
    const voice=audio.current;return()=>{observer.disconnect();for(const name of events){player.removeEventListener(name,update);voice?.removeEventListener(name,update);}};
  },[src,narrationSrc,mediaIdentity?.token,layoutKey]);
  useEffect(()=>{
    const player=video.current;if(!player||!src||!command||(!enabled&&command.action!=='read')||handled.current===command.requestId)return;
    let disposed=false;
    const report=(error?:string)=>{if(!disposed)ack.current?.(command,{paused:player.paused&&(!lesson?.narrationKey||!!audio.current?.paused),ended:player.ended&&(!lesson?.narrationKey||!!audio.current?.ended),currentTime:Math.max(0,player.currentTime||0),duration:Number.isFinite(player.duration)?player.duration:0,rate:player.playbackRate,...(error?{error}:{})});};
    const apply=async()=>{
      if(disposed||handled.current===command.requestId)return;handled.current=command.requestId;
      try{
        if(command.action==='pause'){manuallyPaused.current=true;player.pause();audio.current?.pause();}
        if(command.action==='seek'){if(command.time===undefined||command.time>player.duration)throw Error('Seek exceeds clip duration');player.currentTime=command.time;if(audio.current)audio.current.currentTime=Math.min(command.time,audio.current.duration||0);}
        if(command.action==='rate'){if(!command.rate||command.rate<.5||command.rate>2)throw Error('Invalid playback rate');player.playbackRate=command.rate;if(audio.current)audio.current.playbackRate=command.rate;setSpeed(command.rate);}
        if(command.action==='play'||command.action==='replay'){
          manuallyPaused.current=false;if(command.action==='replay'){player.currentTime=0;if(audio.current)audio.current.currentTime=0;}
          if(!player.ended||!audio.current||audio.current.ended||command.action==='replay')await player.play();
          if(audio.current&&!audio.current.ended)await audio.current.play();
        }
        report();
      }catch(error){report(String((error as Error).message));}
    };
    const fail=()=>{handled.current=command.requestId;report(player.error?.message||'Animation failed to load');};
    if(player.readyState>=1)void apply();else player.addEventListener('loadedmetadata',apply,{once:true});
    player.addEventListener('error',fail,{once:true});
    return()=>{disposed=true;player.removeEventListener('loadedmetadata',apply);player.removeEventListener('error',fail);};
  },[command?.requestId,src,enabled]);
  useEffect(()=>{if(video.current)video.current.playbackRate=speed;if(audio.current)audio.current.playbackRate=speed;},[speed,clip.src,narrationSrc]);
  if(clip.state!=='ready')return <div role="status" style={{padding:16}}><p>{clip.state==='queued'?'Animation queued':clip.state==='rendering'?'Rendering animation…':clip.state==='cancelled'?'Animation cancelled':'Animation could not render'}</p>{clip.error&&<p>{clip.error}</p>}{['queued','rendering'].includes(clip.state)&&<button type="button" onClick={onCancel}>Cancel render</button>}</div>;
  return <div className="tutor-clip" style={{display:'flex',flexDirection:'column',minHeight:0,minWidth:0,flex:'1 1 0'}} onKeyDown={e=>e.stopPropagation()}>
    <div style={{position:'relative',minHeight:0,minWidth:0,flex:'1 1 0'}}>
    <video ref={video} src={src||undefined} controls muted playsInline preload="auto" onLoadedMetadata={()=>{if(!restored.current){restored.current=true;if(saved.current){video.current!.currentTime=Math.min(saved.current.time,video.current!.duration||0);setSpeed(saved.current.rate);}}}} onSeeked={()=>{if(audio.current&&video.current){audio.current.currentTime=Math.min(video.current.currentTime,audio.current.duration||0);if(!video.current.paused&&!audio.current.ended)void audio.current.play().catch(error=>{video.current?.pause();setFailure(`Narration playback unavailable: ${error.message}`);});}}} onPause={()=>{if(!video.current?.ended)audio.current?.pause();if(enabled&&!document.hidden&&src)manuallyPaused.current=true;}} onPlay={()=>{manuallyPaused.current=false;if(audio.current)void audio.current.play().catch(error=>{video.current?.pause();setFailure(`Narration playback unavailable: ${error.message}`);});}} onError={()=>{if(src)setFailure('Playback unavailable. The render is retained.');}} style={{width:'100%',height:'100%',position:'absolute',inset:0,objectFit:'contain',background:'#111b20'}}/>
    {lesson?.narrationKey&&<audio ref={audio} src={narrationSrc||undefined} preload="auto" onLoadedMetadata={()=>{loadedNarrationKey.current=lesson.narrationKey!;if(audio.current&&video.current)audio.current.currentTime=Math.min(review?(saved.current?.narrationTime??video.current.currentTime):video.current.currentTime,audio.current.duration||0);}} onError={()=>{video.current?.pause();setFailure('Narration playback unavailable. Restage this beat to retry.');}}/>}
    {lesson?.started&&!!lesson.annotations.length&&<MediaAnnotations annotations={lesson.annotations} time={mediaTime} rect={mediaRect}/>}
    </div>
    {lesson&&!lesson.started&&<p role="status">Ready · waiting for the explanation cue</p>}
    {!src&&!failure&&<p role="status">Loading animation…</p>}
    <label style={{padding:6}}>Playback speed <select aria-label="Animation playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,.75,1,1.25,1.5,1.75,2].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>
    {failure&&<div role="alert">{failure} <button type="button" onClick={()=>setAttempt(n=>n+1)}>Retry playback</button></div>}
  </div>;
}
