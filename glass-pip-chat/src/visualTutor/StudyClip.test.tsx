import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import StudyClip from './StudyClip';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const loadClip=async()=>new Uint8Array([1,2,3]);
beforeEach(()=>{
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>'blob:test'),revokeObjectURL:vi.fn()});
});
it('shows real render states and sends cancellation only when tapped',()=>{
 const cancel=vi.fn();render(<StudyClip clip={{jobId:'job',state:'rendering'}} loadClip={loadClip} onCancel={cancel}/>);
 expect(cancel).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Cancel render'}));expect(cancel).toHaveBeenCalledOnce();
});
it('starts automatically when a loaded hidden step is revealed and pauses when hidden',async()=>{
 const pause=vi.mocked(HTMLMediaElement.prototype.pause),play=vi.mocked(HTMLMediaElement.prototype.play);
 const {container,rerender,unmount}=render(<StudyClip active={false} clip={{jobId:'job',state:'ready',src:'http://127.0.0.1:1/clip.mp4'}} loadClip={loadClip} onCancel={()=>{}}/>);
 await waitFor(()=>expect(pause).toHaveBeenCalled());expect(play).not.toHaveBeenCalled();
 const video=container.querySelector('video')!;expect(video.controls).toBe(true);fireEvent.change(screen.getByLabelText('Animation playback speed'),{target:{value:'1.5'}});expect(video.playbackRate).toBe(1.5);
 rerender(<StudyClip active clip={{jobId:'job',state:'ready',src:'http://127.0.0.1:1/clip.mp4'}} loadClip={loadClip} onCancel={()=>{}}/>);await waitFor(()=>expect(play).toHaveBeenCalledOnce());
 pause.mockClear();rerender(<StudyClip active={false} clip={{jobId:'job',state:'ready',src:'http://127.0.0.1:1/clip.mp4'}} loadClip={loadClip} onCancel={()=>{}}/>);expect(pause).toHaveBeenCalled();unmount();
});
it('loads via the bounded bridge, retries without rerendering, and releases the blob',async()=>{
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 const create=vi.fn(()=> 'blob:study-test'),revoke=vi.fn();
 vi.stubGlobal('URL', {createObjectURL:create,revokeObjectURL:revoke});
 const load=vi.fn().mockRejectedValueOnce(Error('temporary read failure')).mockResolvedValue(new Uint8Array([1,2,3]));
 const {container,unmount}=render(<StudyClip clip={{jobId:'job',state:'ready',src:'registered-clip'}} loadClip={load} onCancel={()=>{}}/>);
 await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Retry playback'}));
 await waitFor(()=>expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:study-test'));
 expect(load).toHaveBeenNthCalledWith(2,'registered-clip');expect(create).toHaveBeenCalledOnce();
 unmount();expect(revoke).toHaveBeenCalledWith('blob:study-test');
});
it('acknowledges pause and replay on the existing player without loading another clip',async()=>{
 const loader=vi.fn(loadClip),ack=vi.fn();let paused=false;
 vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(async()=>{paused=false;});
 vi.mocked(HTMLMediaElement.prototype.pause).mockImplementation(()=>{paused=true;});
 const clip={jobId:'job',state:'ready' as const,src:'clip'};
 const {container,rerender}=render(<StudyClip clip={clip} loadClip={loader} onCancel={()=>{}} onPlayback={ack}/>);
 await waitFor(()=>expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:test'));
 const video=container.querySelector('video')!;Object.defineProperties(video,{readyState:{value:4},duration:{value:6},paused:{get:()=>paused}});video.currentTime=3;
 const pause={requestId:'pause',boardId:'b',stepId:'s',action:'pause' as const};
 rerender(<StudyClip clip={clip} loadClip={loader} onCancel={()=>{}} command={pause} onPlayback={ack}/>);
 await waitFor(()=>expect(ack).toHaveBeenCalledWith(pause,expect.objectContaining({paused:true,currentTime:3})));
 const replay={...pause,requestId:'again',action:'replay' as const};
 rerender(<StudyClip clip={clip} loadClip={loader} onCancel={()=>{}} command={replay} onPlayback={ack}/>);
 await waitFor(()=>expect(ack).toHaveBeenCalledWith(replay,expect.objectContaining({paused:false,currentTime:0})));
 expect(loader).toHaveBeenCalledOnce();
});
it('holds a staged lesson until its spoken cue and reports actual time/geometry',async()=>{
 const media=vi.fn(),play=vi.mocked(HTMLMediaElement.prototype.play),clip={jobId:'job',state:'ready' as const,src:'clip'};
 const lesson={id:'beat',stepId:'s',cue:'Watch.',mode:'wait' as const,annotations:[],started:false};
 const identity={boardId:'b',stepId:'s',token:'current'};
 const {container,rerender}=render(<StudyClip clip={clip} loadClip={loadClip} lesson={lesson} mediaIdentity={identity} onMedia={media} onCancel={()=>{}}/>);
 await screen.findByText('Ready · waiting for the explanation cue');await waitFor(()=>expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:test'));expect(play).not.toHaveBeenCalled();
 const player=container.querySelector('video')!;Object.defineProperties(player,{videoWidth:{value:1600},videoHeight:{value:900},duration:{value:6},ended:{value:false}});
 vi.spyOn(player,'getBoundingClientRect').mockReturnValue({x:10,y:20,width:800,height:800}as DOMRect);player.currentTime=2;
 fireEvent.loadedMetadata(player);expect(media).toHaveBeenLastCalledWith(expect.objectContaining({token:'current',currentTime:2,bounds:{x:10,y:195,width:800,height:450}}));
 rerender(<StudyClip clip={clip} loadClip={loadClip} lesson={{...lesson,started:true}} mediaIdentity={identity} onMedia={media} onCancel={()=>{}}/>);
 await waitFor(()=>expect(play).toHaveBeenCalledOnce());
});
it('controls managed narration with pause, replay, seek and speed on the same retained clip',async()=>{
 const clip={jobId:'j',state:'ready' as const,src:'clip'},lesson={id:'beat',stepId:'s',cue:'Watch.',mode:'wait' as const,annotations:[],started:true,narration:'Weight equals mass times gravity.',narrationKey:'voice'};
 const ack=vi.fn(),loadVoice=vi.fn(async()=>new Uint8Array(100));
 const props={clip,lesson,review:true,loadClip,loadNarration:loadVoice,onCancel:()=>{},onPlayback:ack};
 const {container,rerender}=render(<StudyClip {...props}/>);
 await waitFor(()=>expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:test'));
 const video=container.querySelector('video')!,audio=container.querySelector('audio')!;
 for(const player of [video,audio])Object.defineProperties(player,{readyState:{value:4},duration:{value:8},ended:{value:false},paused:{value:true}});
 video.currentTime=4;audio.currentTime=4;
 const command=(action:'pause'|'replay'|'seek'|'rate',extra={})=>({boardId:'b',stepId:'s',requestId:action,action,...extra});
 rerender(<StudyClip {...props} command={command('pause')}/>);await waitFor(()=>expect(ack).toHaveBeenCalledWith(expect.objectContaining({action:'pause'}),expect.objectContaining({paused:true})));
 rerender(<StudyClip {...props} command={command('seek',{time:2})}/>);await waitFor(()=>expect(audio.currentTime).toBe(2));expect(video.currentTime).toBe(2);
 rerender(<StudyClip {...props} command={command('rate',{rate:.75})}/>);await waitFor(()=>expect(audio.playbackRate).toBe(.75));expect(video.playbackRate).toBe(.75);
 rerender(<StudyClip {...props} command={command('replay')}/>);await waitFor(()=>expect(audio.currentTime).toBe(0));expect(video.currentTime).toBe(0);expect(loadVoice).toHaveBeenCalledOnce();
});
it('restores a review bookmark paused, including narration position, without autoplay',async()=>{
 const {container}=render(<StudyClip review bookmark={{time:3,rate:.75}} clip={{jobId:'j',state:'ready',src:'clip'}} loadClip={loadClip} onCancel={()=>{}}/>);
 await waitFor(()=>expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:test'));
 const player=container.querySelector('video')!;Object.defineProperty(player,'duration',{value:6});fireEvent.loadedMetadata(player);
 expect(player.currentTime).toBe(3);expect(player.playbackRate).toBe(.75);expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
it('does not report the old video end while a replacement narration track is loading',async()=>{
 const media=vi.fn(),clip={jobId:'j',state:'ready' as const,src:'clip'},lesson={id:'beat',stepId:'s',cue:'Watch.',mode:'wait' as const,annotations:[],started:true,narration:'Weight.',narrationKey:'new-voice'};
 const {container}=render(<StudyClip review clip={clip} lesson={lesson} mediaIdentity={{boardId:'b',stepId:'s',token:'new'}} onMedia={media} loadClip={loadClip} loadNarration={async()=>new Uint8Array(100)} onCancel={()=>{}}/>);
 await waitFor(()=>expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:test'));
 const video=container.querySelector('video')!,audio=container.querySelector('audio')!;
 Object.defineProperties(video,{duration:{value:2},ended:{value:true},videoWidth:{value:640},videoHeight:{value:360}});
 Object.defineProperties(audio,{duration:{value:4},ended:{value:false},paused:{value:true}});
 media.mockClear();fireEvent.loadedMetadata(video);expect(media).not.toHaveBeenCalled();
 fireEvent.loadedMetadata(audio);fireEvent.canPlay(audio);
 expect(media).toHaveBeenLastCalledWith(expect.objectContaining({ended:false,narration:expect.objectContaining({duration:4,ended:false})}));
});
it('keeps telemetry live after a replay is followed by another command',async()=>{
 const media=vi.fn(),ack=vi.fn(),identity={boardId:'b',stepId:'s',token:'same'},clip={jobId:'j',state:'ready' as const,src:'clip'};
 let paused=false;vi.mocked(HTMLMediaElement.prototype.pause).mockImplementation(()=>{paused=true;});vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(async()=>{paused=false;});
 const replay={boardId:'b',stepId:'s',requestId:'replay',action:'replay' as const};
 const props={clip,mediaIdentity:identity,onMedia:media,loadClip,onCancel:()=>{},onPlayback:ack};
 const {container,rerender}=render(<StudyClip {...props} command={replay}/>);
 await waitFor(()=>expect(container.querySelector('video')?.getAttribute('src')).toBe('blob:test'));
 const player=container.querySelector('video')!;Object.defineProperties(player,{readyState:{value:4},duration:{value:2},paused:{get:()=>paused}});fireEvent.loadedMetadata(player);
 await waitFor(()=>expect(ack).toHaveBeenCalled());
 const pause={...replay,requestId:'pause',action:'pause' as const};rerender(<StudyClip {...props} command={pause}/>);
 await waitFor(()=>expect(ack).toHaveBeenCalledWith(pause,expect.objectContaining({paused:true})));
 media.mockClear();fireEvent.pause(player);expect(media).toHaveBeenLastCalledWith(expect.objectContaining({paused:true}));
});
it('resumes associated narration when seeking backwards on a playing video',async()=>{
 const clip={jobId:'j',state:'ready' as const,src:'clip'},lesson={id:'b',stepId:'s',cue:'Watch.',mode:'wait' as const,annotations:[],started:true,narrationKey:'voice'};
 const {container}=render(<StudyClip review clip={clip} lesson={lesson} loadClip={loadClip} loadNarration={async()=>new Uint8Array(100)} onCancel={()=>{}}/>);
 await waitFor(()=>expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:test'));
 const video=container.querySelector('video')!,audio=container.querySelector('audio')!;
 Object.defineProperties(video,{paused:{value:false}});Object.defineProperties(audio,{duration:{value:4},ended:{value:false}});
 video.currentTime=1;vi.mocked(HTMLMediaElement.prototype.play).mockClear();fireEvent.seeked(video);
 expect(audio.currentTime).toBe(1);expect(vi.mocked(HTMLMediaElement.prototype.play).mock.contexts).toContain(audio);
});
