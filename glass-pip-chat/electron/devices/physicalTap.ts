import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { HandoffVisual } from './handoffPresentation.js';
interface HandoffChat { id:string;provider:'codex'|'claude';title:string;sessionId?:string }

export interface TapAdvertiser { start(beacon: string, status: (error?: string) => void): () => void }
interface Client {
  send: (message: unknown) => void; enabled: boolean; nonce?: string; expires: number;
  lastKnock: number; pending?: { id: string; nonce: string; expires: number };
  hold?: {id:string;at:number}; review?: {id:string;nonce:string;expires:number;messageId?:string;terminal?:boolean};
  options?: {control:boolean;viewer:boolean};chat?:HandoffChat;
}
/** Public RF locators are never credentials. Authority belongs only to this authenticated socket.
 * RSSI is an approximate convenience signal; this is not a distance-bounding protocol. */
export class PhysicalTap {
  private clients = new Set<Client>();
  private beacon?: string;
  private target = randomUUID(); // new process/bridge identity, never an advertised pairing key
  private expires = 0;
  private stopRadio?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private ready = false;
  private generation = 0;
  constructor(private radio: TapAdvertiser, private feedback: (state?:HandoffVisual) => void, private now = () => performance.now(), private unlocked = () => true,
    private selected:()=>HandoffChat|null=()=>null,private sessions?:(deviceId:string,chat:HandoffChat,options:{control:boolean;viewer:boolean},id:string)=>void) {}
  connect(kind: string, send: Client['send'], deviceId = '') {
    const c: Client = { send, enabled: false, expires: 0, lastKnock: -Infinity };
    if (kind === 'phone') this.clients.add(c);
    const sendSafe = (message: unknown) => { try { send(message); } catch { this.remove(c); } };
    return {
      message: (m: Record<string, unknown>) => {
        if (!this.clients.has(c)) return;
        if (m.type === 'tap_enable') {
          if (m.enabled !== true) { if(c.hold)this.feedback({id:c.hold.id,phase:'cancelled'});c.hold=undefined;c.review=undefined;c.enabled = false; c.nonce = undefined; c.pending = undefined; this.maybeStop(); return; }
          if (c.enabled) return;
          c.enabled = true;
          if (!this.stopRadio) this.rotate();
          else if (this.ready) this.challenge(c);
        } else if(m.type==='tap_refresh') {
          if(c.enabled&&this.ready&&this.unlocked()&&!c.pending)this.challenge(c);
        } else if(m.type==='tap_hold') {
          if(m.cancel===true){const h=c.hold;if(h&&h.id===m.id){this.feedback({id:h.id,phase:'cancelled'});c.hold=undefined;}return;}
          if(!c.enabled||!this.ready||!this.unlocked()||this.now()>=c.expires||m.target!==this.target||m.beacon!==this.beacon||!c.nonce||m.nonce!==c.nonce||typeof m.id!=='string'||!/^[\w-]{8,80}$/.test(m.id)||typeof m.progress!=='number'||!Number.isFinite(m.progress)||m.progress<0||m.progress>1)return;
          if(c.hold&&this.now()-c.hold.at<120)return;
          c.hold={id:m.id,at:this.now()};this.feedback({id:m.id,phase:'holding',progress:m.progress});
        } else if (m.type === 'tap_knock') {
          const time = this.now();
          if (!c.enabled || !this.unlocked() || !this.ready || time >= c.expires || time >= this.expires ||
              m.target !== this.target || m.beacon !== this.beacon || !c.nonce || m.nonce !== c.nonce ||
              typeof m.requestId !== 'string' || !/^[\w-]{8,80}$/.test(m.requestId) || time - c.lastKnock < 5000) {
            sendSafe({ type: 'tap_rejected', requestId: m.requestId, reason: 'Tap expired or disconnected. Try again near your paired PC.' }); return;
          }
          c.lastKnock = time; c.nonce = undefined; // consume before any side effect
          c.chat=this.selected()??undefined;
          const options=m.options&&typeof m.options==='object'?m.options as Record<string,unknown>:{};
          c.options={control:options.control===true,viewer:options.viewer===true};
          c.pending = { id: m.requestId, nonce: randomBytes(32).toString('hex'), expires: time + 60000 };
          sendSafe({ type: 'tap_review', protocol:2,target: this.target, requestId: c.pending.id, reviewNonce: c.pending.nonce,chat:c.chat });
        } else if (m.type === 'tap_opened') {
          const p = c.pending; c.pending = undefined;
          if (!c.enabled || !this.unlocked() || !p || this.now() >= p.expires || m.requestId !== p.id || m.reviewNonce !== p.nonce) return;
          c.review={...p,expires:this.now()+15*60_000};
          // Means local review opened, not attachment upload, message delivery or agent execution.
          sendSafe({ type: 'tap_feedback', requestId: p.id });
          this.feedback({id:p.id,phase:'review'});
          if(c.chat&&c.options&&(c.options.control||c.options.viewer))this.sessions?.(deviceId,c.chat,c.options,p.id);
        } else if(m.type==='tap_delivery') {
          const r=c.review;
          if(!r||!c.enabled||!this.unlocked()||this.now()>=r.expires||m.handoffId!==r.id||m.nonce!==r.nonce||r.terminal||typeof m.messageId!=='string'||!/^[\w-]{8,80}$/.test(m.messageId))return;
          if(m.phase==='sending'&&(!r.messageId||r.messageId===m.messageId)){r.messageId=m.messageId;this.feedback({id:r.id,phase:'sending'});}
          else if(r.messageId===m.messageId&&(m.phase==='accepted'||m.phase==='failed')){r.terminal=m.phase==='accepted';this.feedback({id:r.id,phase:m.phase});}
        }
      },
      close: () => this.remove(c),
    };
  }
  private challenge(c: Client) {
    c.nonce = randomBytes(32).toString('hex'); c.expires = this.expires;
    try { c.send({ type: 'tap_target',protocol:2, target: this.target, beacon: this.beacon, nonce: c.nonce, ttlMs: Math.max(0, this.expires - this.now()) }); }
    catch { this.remove(c); }
  }
  private rotate() {
    this.stop(true);
    if (![...this.clients].some(c => c.enabled)) return;
    if (!this.unlocked()) { this.suspend(); return; }
    const generation = this.generation;
    this.beacon = randomBytes(16).toString('hex');
    this.stopRadio = this.radio.start(this.beacon, error => {
      if (generation !== this.generation) return;
      if (!this.unlocked()) { this.suspend(); return; }
      if (error) {
        this.ready = false;
        for (const c of this.clients) if (c.enabled) {
          c.nonce = undefined; c.pending = undefined;
          try { c.send({ type: 'tap_unavailable', reason: error.slice(0, 200) }); } catch { /* socket teardown owns removal */ }
        }
        return;
      }
      this.ready = true; this.expires = this.now() + 25000;
      for (const c of this.clients) if (c.enabled) this.challenge(c);
    });
    this.timer = setTimeout(() => this.rotate(), 28000);
  }
  private remove(c: Client) { if(c.hold)this.feedback({id:c.hold.id,phase:'cancelled'});this.clients.delete(c); c.nonce = undefined; c.pending = undefined;c.review=undefined;this.maybeStop(); }
  suspend() {
    this.stop();
    for (const c of this.clients) if (c.enabled) {
      try { c.send({ type: 'tap_unavailable', reason: 'Unlock your paired PC before physical tap. Manual review is still available.' }); } catch { /* disconnect revokes separately */ }
    }
    if ([...this.clients].some(c => c.enabled)) this.timer = setTimeout(() => this.rotate(), 5000);
  }
  private maybeStop() { if (![...this.clients].some(c => c.enabled)) this.stop(); }
  private stop(keepReviewReceipts = false) {
    this.generation++; clearTimeout(this.timer); this.timer = undefined;
    this.ready = false; this.expires = 0;
    for (const c of this.clients) {
      c.nonce = undefined;
      // A locally frozen snapshot may be awaiting the user's draft choice. This receipt
      // can only animate an already-imported review; it cannot authorize another capture.
      if(!keepReviewReceipts)c.review=undefined;
      if (!keepReviewReceipts || (c.pending && this.now() >= c.pending.expires)) c.pending = undefined;
    }
    this.stopRadio?.(); this.stopRadio = undefined;
  }
  close() { this.stop(); this.clients.clear(); }
}
