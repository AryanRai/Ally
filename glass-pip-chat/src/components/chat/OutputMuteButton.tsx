import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

type MuteApi = { outputMute: () => Promise<{muted:boolean}>; setOutputMute: (muted:boolean) => Promise<{muted:boolean}>; onOutputMute?: (callback:(value:{muted:boolean})=>void)=>()=>void };
/** Same persisted output control in the pill, desktop chat and native chat. */
export default function OutputMuteButton({ api = window.pip?.speech, className = '' }: { api?: MuteApi; className?: string }) {
  const [muted,setMuted]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const revision=useRef(0);
  useEffect(()=>{
    if(!api?.outputMute)return;
    let alive=true,inFlight=false;
    const apply=(value:{muted:boolean})=>{if(alive){setMuted(value.muted);setReady(true);}};
    const refresh=async()=>{if(inFlight||document.hidden||(window as Window & {__allySurfaceVisible?:boolean}).__allySurfaceVisible===false)return;inFlight=true;const read=revision.current;try{const value=await api.outputMute();if(read===revision.current)apply(value);}catch{}finally{inFlight=false;}};
    const detach=api.onOutputMute?.(value=>{revision.current++;apply(value);});
    void refresh();const timer=setInterval(refresh,1000);
    return()=>{alive=false;detach?.();clearInterval(timer);};
  },[api]);
  const label=muted?'Unmute Ally':'Mute Ally';
  return <button type="button" data-ally-output-mute aria-label={label} aria-pressed={muted} disabled={!ready||busy} title={error||`${label} · spoken replies and sounds`} style={{WebkitAppRegion:'no-drag'} as React.CSSProperties}
    className={`inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-40 ${muted?'bg-white/10 text-foreground':''} ${className}`}
    onClick={async()=>{if(!api)return;revision.current++;setBusy(true);setError('');try{setMuted((await api.setOutputMute(!muted)).muted);}catch{setError('Could not change Ally audio. Try again.');}finally{revision.current++;setBusy(false);}}}>
    {muted?<VolumeX className="size-3.5"/>:<Volume2 className="size-3.5"/>}
  </button>;
}
