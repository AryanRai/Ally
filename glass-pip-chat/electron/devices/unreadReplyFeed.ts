import { hiddenConversation, resolveCodexDiscovery } from '../agent/codexDiscovery.js';
import { allReadStates, type ChatReadState } from '../agent/unread.js';
import { loadAgentSession } from '../agent/sessions.js';
import { loadCodexChat } from '../agent/codexHistory.js';
import { isManagedSessionRunning } from '../agent/runningSessions.js';
import type { AgentProvider, AgentSessionSnapshot } from '../agent/types.js';
import type { ReplyNotice } from '../notifications.js';
import { deviceHistoryReply, replyPreview } from '../watch/presentation.js';

interface Dependencies {
  states(): ChatReadState[];
  load(provider: AgentProvider, id: string): Promise<AgentSessionSnapshot>;
  busy(provider: AgentProvider, id: string): boolean;
  send(notice: ReplyNotice): void;
}
/** Mirror confirmed unread completions, including native external chats, with no model calls. */
export class UnreadReplyFeed {
  private seen = new Map<string,string>();
  private stopped = false;
  constructor(private deps: Dependencies) {}
  stop() { this.stopped = true; }
  async poll() {
    const candidates=this.deps.states().filter(s => s.unread && s.revision && this.seen.get(s.key)!==s.revision).slice(0,16);
    for(const state of candidates) {
      if(this.stopped) return;
      const match=/^(codex|claude):([\w-]{8,100})$/.exec(state.key);
      if(!match) continue;
      const provider=match[1] as AgentProvider, id=match[2];
      if(this.deps.busy(provider,id)) continue;
      try {
        if (provider === 'codex') await resolveCodexDiscovery(id);
        if (hiddenConversation(provider, id)) continue;
        const snapshot=await this.deps.load(provider,id);
        if(this.stopped) return;
        const current=this.deps.states().find(s => s.key===state.key);
        if(!current?.unread || current.revision!==state.revision || snapshot.running || this.deps.busy(provider,id)) continue;
        const reply=snapshot.messages.at(-1);
        if(reply?.role!=='assistant') continue;
        const final = deviceHistoryReply(reply);
        // Commentary alone is never a completed answer.
        if (!final.text.trim() && !final.components.length) continue;
        const text=replyPreview(final.text);
        this.deps.send({id:`unread:${state.key}:${state.revision}`,readRevision:state.revision,title:snapshot.title || 'Reply ready',text,
          session:{id,provider,title:snapshot.title || 'Reply ready',cwd:snapshot.cwd || ''}});
        this.seen.set(state.key,state.revision);
        while(this.seen.size>500) this.seen.delete(this.seen.keys().next().value!);
      } catch { /* Unavailable history is not a completion; retry after reconnect. */ }
    }
  }
}
export function startUnreadReplyFeed(send: Dependencies['send']) {
  const feed=new UnreadReplyFeed({states:allReadStates,load:async(provider,id)=>provider==='codex'?loadCodexChat(id):loadAgentSession(provider,id),busy:isManagedSessionRunning,send});
  let timer: ReturnType<typeof setTimeout>, stopped=false;
  const poll=async()=>{ try {await feed.poll();} catch { /* Read-state refresh failures retry without breaking device sockets. */ } finally {if(!stopped) timer=setTimeout(poll,5000);} };
  void poll();
  return ()=>{stopped=true;feed.stop();clearTimeout(timer);};
}
