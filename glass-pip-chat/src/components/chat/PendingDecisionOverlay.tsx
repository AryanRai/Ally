import {useEffect,useState} from 'react';
import type {ChatInteraction} from '../../../electron/devices/interactions';
import ChatInteractionCard from './ChatInteractionCard';

/** Global requests stay visible even while their conversation is not selected. */
export default function PendingDecisionOverlay({ excludeChatId }: { excludeChatId?: string }) {
  const [rows,setRows]=useState<ChatInteraction[]>([]),[hidden,setHidden]=useState('');
  useEffect(()=>{
    const api=window.pip?.agent;if(!api?.pendingInteractions)return;
    let alive=true,revision=0;
    const refresh=async()=>{const current=++revision;try{const next=await api.pendingInteractions();if(alive&&current===revision)setRows(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);}catch{}};
    const stop=api.onInteractionsChanged(()=>void refresh());void refresh();
    return()=>{alive=false;stop();};
  },[]);
  const visibleRows=rows.filter(row=>row.chatId!==excludeChatId);
  const signature=visibleRows.map(r=>r.id).join(',');
  if(!visibleRows.length||hidden===signature)return null;
  return <section role="dialog" aria-label="Ally needs your decision" aria-live="polite" className="absolute inset-x-2 top-2 z-[100] max-h-[90vh] overflow-auto rounded-2xl border border-amber-300/50 bg-[#15181e] p-3 shadow-2xl">
    <div className="mb-2 flex items-center justify-between text-sm"><strong>Ally needs your decision · {visibleRows.length}</strong><button type="button" className="px-2 py-1" onClick={()=>setHidden(signature)}>Later</button></div>
    <div className="space-y-2">{visibleRows.map(row=><ChatInteractionCard key={row.id} request={{...row,state:'pending'}} onAnswer={async(id,answer)=>{await window.pip.agent!.answerInteraction(row.chatId,id,answer);setRows(old=>old.filter(r=>r.id!==id));}}/>)}</div>
  </section>;
}
