import {useEffect,useState} from 'react';
import type {HandoffVisual} from '../../../electron/devices/handoffPresentation';
type Host=Window&{__allyHandoff?:HandoffVisual|null};
/** Embedded in the active surface. Does not navigate, take focus, answer consent or send. */
export default function HandoffHalo({value}:{value?:HandoffVisual|null}){
 const [event,setEvent]=useState<HandoffVisual|null>(()=>(window as Host).__allyHandoff??null);
 useEffect(()=>{
  const listener=(e:Event)=>setEvent((e as CustomEvent<HandoffVisual|null>).detail);
  window.addEventListener('ally-handoff',listener);
  const off=window.pip?.onHandoff?.(setEvent);
  return()=>{off?.();window.removeEventListener('ally-handoff',listener);};
 },[]);
 const state=value===undefined?event:value;
 if(!state||state.phase==='cancelled')return null;
 const label={holding:'Hold close to hand off',review:'Ready on your phone',sending:'Receiving your handoff',accepted:'Added to your conversation',failed:'Send needs your attention'}[state.phase];
 const sub={holding:'Move away to cancel',review:'Swipe up to Send · change chat anytime',sending:'Sending to the chat you chose',accepted:'Continue in the same chat',failed:'Review the saved draft on your phone'}[state.phase];
 return <div role="status" aria-live={state.phase==='holding'?'off':'polite'} style={{position:'absolute',inset:0,zIndex:60,pointerEvents:'none',display:'flex',alignItems:'flex-end',justifyContent:'center',background:'radial-gradient(ellipse at bottom,#61efbe28,transparent 65%)',boxShadow:'inset 0 0 22px #7dffde44',borderRadius:'inherit',overflow:'hidden'}}>
 <style>{`@keyframes handoff-orbit{0%{transform:scale(.4);opacity:0}30%{opacity:.7}100%{transform:scale(2);opacity:0}}@media(prefers-reduced-motion:reduce){.handoff-orbit{animation:none!important}}`}</style>
 <div style={{display:'flex',alignItems:'center',gap:12,padding:'4px 14px',maxWidth:'100%',background:'#10271ee8',borderRadius:24,margin:4}}><div style={{position:'relative',width:52,height:52,flexShrink:0}}>
 {[0,1,2].map(i=><span key={`${state.id}-${state.phase}-${i}`} className="handoff-orbit" style={{position:'absolute',inset:3,border:'1px solid #89f4d7',borderRadius:'50%',animation:`handoff-orbit 1.5s ${i*.3}s ${state.phase==='holding'?'infinite':'2'}`}}/>)}
 <svg width="52" height="52" viewBox="0 0 52 52" style={{position:'relative'}}><circle cx="26" cy="26" r="21" fill="#193d34" stroke="#427c6b" strokeWidth="3"/><circle cx="26" cy="26" r="21" fill="none" stroke="#abffe7" strokeWidth="3" strokeDasharray="132" strokeDashoffset={132*(1-(state.phase==='holding'?state.progress??0:1))} transform="rotate(-90 26 26)"/><rect x="20" y="15" width="12" height="23" rx="4" fill="none" stroke="#dcfff4" strokeWidth="2"/></svg></div>
 <div style={{minWidth:0,color:'#e4fff5'}}><div style={{fontSize:15,fontWeight:600}}>{label}</div><div style={{fontSize:11,opacity:.72,marginTop:4}}>{sub}</div></div></div></div>;
}
