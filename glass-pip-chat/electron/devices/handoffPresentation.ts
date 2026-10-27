import { EventEmitter } from 'node:events';
export type HandoffPhase = 'holding'|'review'|'sending'|'accepted'|'cancelled'|'failed';
export interface HandoffVisual { id: string; phase: HandoffPhase; progress?: number; at?: number }
/** Public UI state only. It never authorizes an action or contains capture bytes or credentials. */
export class HandoffPresentation {
  private value: HandoffVisual|null = null;
  private events = new EventEmitter();
  private expiry?: ReturnType<typeof setTimeout>;
  snapshot() { return this.value && {...this.value}; }
  subscribe(listener:(value:HandoffVisual|null)=>void) {this.events.on('change',listener);return()=>{this.events.off('change',listener);};}
  publish(value:HandoffVisual) {
    if(!/^[\w-]{8,80}$/.test(value.id)||!['holding','review','sending','accepted','cancelled','failed'].includes(value.phase))return;
    if(value.phase==='cancelled'&&this.value?.id!==value.id)return;
    const progress=value.progress===undefined?undefined:Math.max(0,Math.min(1,value.progress));
    if(progress!==undefined&&!Number.isFinite(progress))return;
    clearTimeout(this.expiry);this.value={id:value.id,phase:value.phase,progress,at:Date.now()};this.events.emit('change',this.snapshot());
    this.expiry=setTimeout(()=>{this.value=null;this.events.emit('change',null);},value.phase==='holding'?1400:value.phase==='review'?10000:value.phase==='sending'?15000:3500);
    this.expiry.unref?.();
  }
  close(){clearTimeout(this.expiry);this.value=null;this.events.removeAllListeners();}
}
export const handoffPresentation=new HandoffPresentation();
