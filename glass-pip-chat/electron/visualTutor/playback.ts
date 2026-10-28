export interface PlaybackCommand { requestId: string; boardId: string; stepId: string; action: 'play'|'pause'|'replay'|'read'|'seek'|'rate'; time?:number; rate?:number }
export interface PlaybackState { paused: boolean; ended: boolean; currentTime: number; duration: number; rate?:number; error?: string }
export interface PlaybackBookmark {time:number;rate:number;narrationTime?:number}
/** Retries return the original renderer receipt, never replay an animation twice. */
export class StudyPlayback {
  private receipts = new Map<string,{key:string;result:Promise<PlaybackState>}>();
  private pending?: {command:PlaybackCommand;resolve:(state:PlaybackState)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
  request(command:PlaybackCommand, send:()=>void):Promise<PlaybackState> {
    const key=JSON.stringify(command),prior=this.receipts.get(command.requestId);
    if(prior){if(prior.key!==key)throw Error('Playback requestId was already used with different data');return prior.result;}
    if(this.pending)throw Error('Wait for the current playback command to finish');
    const result=new Promise<PlaybackState>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending=undefined;reject(Error('Playback was not confirmed. Read playback state before retrying with a new requestId.'));},8000);
      this.pending={command,resolve,reject,timer};
    });
    if(this.receipts.size>=128)this.receipts.delete(this.receipts.keys().next().value!);
    this.receipts.set(command.requestId,{key,result});
    try{send();}catch{this.reset();}
    return result;
  }
  acknowledge(command:PlaybackCommand,state:PlaybackState):boolean {
    const pending=this.pending;if(!pending||JSON.stringify(pending.command)!==JSON.stringify(command))return false;
    if(typeof state?.paused!=='boolean'||typeof state.ended!=='boolean'||!Number.isFinite(state.currentTime)||!Number.isFinite(state.duration)||state.currentTime<0||state.duration<0)return false;
    clearTimeout(pending.timer);this.pending=undefined;
    if(state.error)pending.reject(Error(String(state.error).slice(0,300)));else pending.resolve(state);
    return true;
  }
  reset(){if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('Study board closed before playback was confirmed'));this.pending=undefined;}this.receipts.clear();}
}
