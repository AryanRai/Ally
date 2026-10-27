import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import ChatSidebar from '@/components/ChatSidebar';
import {AgentReply} from '@/components/chat/ChatMessage';
import CompactUserMessage from '@/components/chat/CompactUserMessage';
import {PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit} from '@/components/ai-elements/prompt-input';
import {Button} from '@/components/ui/button';
import {TooltipProvider} from '@/components/ui/tooltip';
import type {AgentSessionSummary} from '@/types/agent';
import {DISCOVERY_PROVIDERS,mergeProviderPages,type ProviderPage} from '@/utils/mergeProviderPages';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@/styles/index.css';
import './notch.css';
import NotchHome from './home';
import HandoffHalo from '@/components/chat/HandoffHalo';
import {PendingDecisions} from './decisions';
import { ChatSurfaceBoundary } from '@/components/chat/ChatSurfaceBoundary';
import { waitForSurfaceVisible } from './surfaceVisibility';

type Provider = 'codex'|'claude';
type Permission = 'readonly'|'edit'|'full';
type Chat = {id:string; provider:Provider; sessionId?:string; title:string; cwd:string; updatedAt:number; createdAt?:number};
type Attachment = {id:string;name:string;mimeType:string;size:number;url:string};
type DraftFile = {id:string;file:File};
type Message = {id:string; role:'user'|'assistant'; text:string; timestamp:number; attachments?:Attachment[];components?:unknown[]; steps?:{id:string; name:string; status:string; detail?:string}[]};
type Approval = {id:string; title:string; detail:string; fields:{id:string; label:string; secret:boolean; required:boolean; freeText:boolean; options:{value:string;label:string}[]}[]; actions:{value:string;label:string}[]};
type Turn = {id:string; chatId:string; status:string; startedAt?:number; activity?:string; transcript?:string;liveText?:string; reply?:{text:string;components?:unknown[]}; error?:string; approvals?:Approval[]};
type History = {chat:Chat; messages:Message[]; before:number|null; running:boolean; canStop:boolean; activeTurnId?:string;queue?:{items:{id:string;text:string;state:string;error?:string}[]}};
const capability = location.hash.slice(1) || sessionStorage.getItem('ally-notch-capability') || '';
const homePreview = new URLSearchParams(location.search).get('view') === 'preview';
try {if(capability)sessionStorage.setItem('ally-notch-capability',capability);} catch {}
history.replaceState(null, '', location.pathname + (homePreview ? '?view=preview' : ''));
async function api(route:string, body?:unknown) {
  if (body === undefined) await waitForSurfaceVisible();
  const response = await fetch(`/notch-api/v1/${route}`, {
    method:body === undefined ? 'GET':'POST', headers:{Authorization:`Bearer ${capability}`,'Content-Type':'application/json'},
    body:body === undefined ? undefined:JSON.stringify(body), signal:AbortSignal.timeout(95000),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(Error(data.error || `Ally returned ${response.status}`),{status:response.status});
  return data;
}
Object.defineProperty(window,'pip',{value:{agent:{readStates:async()=> (await api('read-states')).states}}});
const session = (chat:Chat):AgentSessionSummary => ({...chat,id:chat.sessionId || chat.id});
const searchChats = (query:string) => api(`chat-search?q=${encodeURIComponent(query)}`);
const replyText = (message:{text:string;components?:unknown[]}) => message.components?.length ? JSON.stringify({text:message.text,components:message.components}) : message.text;
function readStorage<T,>(key:string, fallback:T):T {try {return JSON.parse(localStorage.getItem(key) || sessionStorage.getItem(key) || 'null') ?? fallback;} catch {return fallback;}}

function AttachmentView({asset}:{asset:Attachment}) {
  const [preview,setPreview]=useState('');
  useEffect(()=>{
    if(!asset.mimeType.startsWith('image/'))return;
    let alive=true,objectUrl='';const controller=new AbortController();
    void fetch(`/notch-api/v1/attachments/${encodeURIComponent(asset.id)}`,{headers:{Authorization:`Bearer ${capability}`},signal:controller.signal}).then(async r=>{
      if(!r.ok)throw Error('Preview unavailable');objectUrl=URL.createObjectURL(await r.blob());if(alive)setPreview(objectUrl);
    }).catch(()=>{});
    return()=>{alive=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[asset.id,asset.mimeType]);
  const [error,setError]=useState('');
  async function download() {
    try {
      const result=await fetch(`/notch-api/v1/attachments/${encodeURIComponent(asset.id)}`,{headers:{Authorization:`Bearer ${capability}`},signal:AbortSignal.timeout(30000)});
      if(!result.ok)throw Error('This attachment is unavailable.');
      const url=URL.createObjectURL(await result.blob()),link=document.createElement('a');link.href=url;link.download=asset.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setError((e as Error).message);}
  }
  return <div className="attachment"><Button size="sm" variant="ghost" onClick={()=>void download()} title={`Download ${asset.name}`}>{preview?<img src={preview} alt={asset.name} style={{maxWidth:180,maxHeight:120}}/>:asset.name}</Button>{error && <small role="alert">{error}</small>}</div>;
}

function App() {
  const [chats,setChats] = useState<Chat[]>([]);
  const [running,setRunning] = useState<Chat[]>([]);
  const runningRef=useRef(running);runningRef.current=running;
  const lastHistoryRefresh=useRef(0);
  const [offsets,setOffsets] = useState<Record<Provider,number|null>>({codex:0,claude:0});
  const discoveryState=useRef({chats,offsets,expanded:{codex:false,claude:false}});
  discoveryState.current={...discoveryState.current,chats,offsets};
  const discovering=useRef<Promise<void>|undefined>(undefined);
  const [provider,setProvider] = useState<Provider>('codex');
  const [selected,setSelected] = useState<string|null>(null);
  const selectedRef = useRef(selected); selectedRef.current=selected;
  const navigation = useRef(0);
  const [view,setView] = useState<History|null>(null);
  const prefetched=useRef<History|null>(null);
  const [turn,setTurn] = useState<Turn|null>(null);
  const [collapsed,setCollapsed] = useState(false);
  const [drafts,setDrafts] = useState<Record<string,string>>(()=>readStorage('ally-notch-drafts',{}));
  const [files,setFiles]=useState<Record<string,DraftFile[]>>({});
  const uploaded=useRef(new Map<string,string>());
  const filePicker=useRef<HTMLInputElement>(null);
  const [permissions,setPermissions] = useState<Record<string,Permission>>(()=>readStorage('ally-notch-permissions',{}));
  const [error,setError] = useState('');
  const [greeting,setGreeting] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const listRef=useRef<HTMLDivElement>(null);
  const nearBottom=useRef(true);
  const sendReceipt=useRef<{key:string;id:string}|null>(null);
  const input = drafts[selected || 'new'] || '';
  const draftFiles=files[selected || 'new'] || [];
  function attach(incoming:FileList|File[]) {
    if(!selected)return;
    const added=Array.from(incoming),existing=files[selected] || [];
    if(added.some(f=>!f.size || f.size>20*1024*1024) || existing.length+added.length>6 || [...existing.map(f=>f.file),...added].reduce((n,f)=>n+f.size,0)>40*1024*1024){setError('Choose up to six files, at most 20 MB each and 40 MB together.');return;}
    setFiles(old=>({...old,[selected]:[...(old[selected] || []),...added.map(file=>({file,id:crypto.randomUUID()}))]}));
  }
  const permission = permissions[selected || 'new'] || 'readonly';
  const fail=(e:Error)=>setError(e.message);
  useEffect(()=>{try {localStorage.setItem('ally-notch-drafts',JSON.stringify(drafts));} catch {setError('Draft storage is full. Your draft is kept in this window.');}},[drafts]);
  useEffect(()=>{try {localStorage.setItem('ally-notch-permissions',JSON.stringify(permissions));} catch {}},[permissions]);
  // Same greeting as the floating pill; refreshed when the model writes a new one.
  useEffect(()=>{let alive=true;let timer:ReturnType<typeof setTimeout>;async function load(){try {const data=await api('greeting');if(alive && data.greeting)setGreeting(data.greeting);}catch{} if(alive)timer=setTimeout(load,60000);}void load();return()=>{alive=false;clearTimeout(timer);};},[]);
  async function discover(more=false) {
    if(discovering.current)return discovering.current;
    const pending=Promise.allSettled(DISCOVERY_PROVIDERS.map(async p=> {
      const offset=more?discoveryState.current.offsets[p]:0;
      if(offset===null)return undefined;
      return await api(`chats?provider=${p}&offset=${offset}`) as ProviderPage<Chat>;
    })).then(pages=>{
      const old=discoveryState.current,result=mergeProviderPages(old.chats,old.offsets,old.expanded,pages,more);
      discoveryState.current=result;
      setChats(result.chats);setOffsets(result.offsets);setError(result.error);
    }).finally(()=>{if(discovering.current===pending)discovering.current=undefined;});
    discovering.current=pending;return pending;
  }
  useEffect(()=>{void discover();void api('selection').then(data=>{
    if(data.selected) {
      setSelected(data.selected.chatId);setProvider(data.selected.provider);
      setPermissions(old=>({...old,[data.selected.chatId]:data.selected.permission}));
    }
  }).catch(fail);},[]);
  useEffect(()=>{
    let alive=true;let timer:ReturnType<typeof setTimeout>;
    async function sync(){
      try {
        const revision=navigation.current;
        const state=await api('selection');
        if(alive && revision===navigation.current && state.selected) setPermissions(old=>old[state.selected.chatId]===state.selected.permission?old:{...old,[state.selected.chatId]:state.selected.permission});
        if(alive && revision===navigation.current && (state.selected?.chatId || null)!==selectedRef.current) {
          const id=state.selected?.chatId || null;
          selectedRef.current=id;prefetched.current=null;
          setSelected(id);setView(null);setTurn(null);nearBottom.current=true;
          if(state.selected) {setProvider(state.selected.provider);setPermissions(old=>({...old,[id!]:state.selected.permission}));}
        }
      }catch(e){if(alive)fail(e as Error);}
      if(alive)timer=setTimeout(sync,1500);
    }
    timer=setTimeout(sync,1500);return()=>{alive=false;clearTimeout(timer);};
  },[]);
  useEffect(()=>{
    let alive=true; let timer:ReturnType<typeof setTimeout>;
    async function refresh(){try {const data=await api('running');if(alive)setRunning(data.chats || data);}catch{} if(alive)timer=setTimeout(refresh,5000);}
    void refresh();return()=>{alive=false;clearTimeout(timer);};
  },[]);
  async function choose(id:string, created?:Chat) {
    if(busy && !created)return;setBusy(true);
    const revision=++navigation.current;
    try {
      const chat=created || chats.find(c=>c.id===id);
      const engine=chat?.provider || (id.startsWith('claude:')?'claude':'codex');
      const data=await api('selection',{chatId:id,provider:engine,permission:permissions[id] || 'readonly'});
      if(revision!==navigation.current)return;
      if(data.conflict || !data.history) {setError('The selected chat changed in Ally. Open it again to continue.');return;}
      prefetched.current=data.history;
      setSelected(data.selected.chatId);setView(data.history);setTurn(data.history.activeTurnId?{id:data.history.activeTurnId,chatId:data.selected.chatId,status:'thinking'}:null);setError('');nearBottom.current=true;
      setProvider(data.selected.provider);
      setPermissions(old=>({...old,[data.selected.chatId]:data.selected.permission}));
    }catch(e){fail(e as Error);}finally{setBusy(false);}
  }
  async function refreshHistory(id:string, before?:number) {
    lastHistoryRefresh.current=Date.now();
    const data:History=await api(`chats/${encodeURIComponent(id)}${before===undefined?'':`?before=${before}`}`);
    if(selectedRef.current!==id)return;
    setView(old=> {
      if(!old)return data;
      if(before!==undefined)return {...old,before:data.before,messages:[...new Map([...data.messages,...old.messages].map(m=>[m.id,m])).values()]};
      const earlier=old.messages.filter(m=>!data.messages.length || m.timestamp<data.messages[0].timestamp);
      return {...data,before:old.before===null?null:Math.min(old.before,data.before??0)||null,messages:[...new Map([...earlier,...data.messages].map(m=>[m.id,m])).values()]};
    });
    setProvider(data.chat.provider);
    setChats(old=>[...new Map([...old,data.chat].map(c=>[c.id,c])).values()]);
    if(data.activeTurnId) setTurn(old=>old?.id===data.activeTurnId ? old:{id:data.activeTurnId!,chatId:data.chat.id,status:'thinking'});
  }
  useEffect(()=>{
    if(!selected)return;
    if(prefetched.current?.chat.id===selected) {
      const data=prefetched.current;prefetched.current=null;setLoading(false);
      setView(data);
      if(data.activeTurnId)setTurn({id:data.activeTurnId,chatId:data.chat.id,status:'thinking'});
      return;
    }
    let alive=true;setLoading(true);
    void refreshHistory(selected).catch(e=>{if(alive)fail(e);}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[selected]);
  useEffect(()=>{
    if(!selected || !turn || turn.status!=='thinking')return;
    let alive=true;let timer:ReturnType<typeof setTimeout>;
    async function poll(){try {
      const next:Turn=await api(`turns/${encodeURIComponent(turn!.id)}`);
      if(!alive)return;setTurn(next);
      if(next.status!=='thinking') {await refreshHistory(selected!); if(next.error)setError(next.error);return;}
      timer=setTimeout(poll,1000);
    } catch(e){if(alive){fail(e as Error);if((e as Error & {status?:number}).status===404)setTurn(old=>old?{...old,status:'error'}:old);else timer=setTimeout(poll,3000);}}}
    void poll();return()=>{alive=false;clearTimeout(timer);};
  },[selected,turn?.id,turn?.status]);
  useEffect(()=>{
    if(!selected)return;
    let alive=true;let timer:ReturnType<typeof setTimeout>;
    async function refresh(){try {
      const state=await api('selection');
      if(!alive)return;
      if(state.activeTurn?.chatId===selected) setTurn(old=>old?.id===state.activeTurn.id?old:{...state.activeTurn,status:'thinking'});
      if(turn?.status!=='thinking' && (view?.running || runningRef.current.some(c=>c.id===selected || c.sessionId===view?.chat.sessionId && c.provider===view?.chat.provider) || Date.now()-lastHistoryRefresh.current>30000))await refreshHistory(selected!);
    }catch(e){if(alive)fail(e as Error);}if(alive)timer=setTimeout(refresh,3000);}
    timer=setTimeout(refresh,3000);return()=>{alive=false;clearTimeout(timer);};
  },[selected,turn?.status,view?.running]);
  useEffect(()=>{if(nearBottom.current && listRef.current)listRef.current.scrollTop=listRef.current.scrollHeight;},[view?.messages,turn?.reply,turn?.activity]);
  async function create() {
    if(busy)return;setBusy(true);
    try {const result=await api('chats',{provider,permission,requestId:crypto.randomUUID()});setChats(old=>[result.chat,...old]);await choose(result.chat.id,result.chat);}
    catch(e){fail(e as Error);}finally{setBusy(false);}
  }
  async function send() {
    if(!selected || !view || busy || (!input.trim() && !draftFiles.length))return;
    const id=selected, text=input, sentFiles=[...draftFiles],key=JSON.stringify([id,text,permission,sentFiles.map(f=>f.id)]);
    const requestId=sendReceipt.current?.key===key?sendReceipt.current.id:crypto.randomUUID();
    sendReceipt.current={key,id:requestId};setBusy(true);setError('');
    try {
      const attachments=[];
      for(const item of sentFiles) {
        if(!uploaded.current.has(item.id)) {
          const response=await fetch('/notch-api/v1/attachments',{method:'POST',headers:{Authorization:`Bearer ${capability}`,'Content-Type':item.file.type || 'application/octet-stream','x-ally-filename':encodeURIComponent(item.file.name)},body:item.file,signal:AbortSignal.timeout(90000)});
          const result=await response.json();if(!response.ok)throw Error(result.error || 'Upload failed. Your draft is kept.');uploaded.current.set(item.id,result.attachment.id);
        }
        attachments.push(uploaded.current.get(item.id));
      }
      const active=turn?.status==='thinking' || view.running;
      const result=await api(active?`chats/${encodeURIComponent(view.chat.id)}/input`:'messages',active
        ?{mode:'queue',text,permission,requestId,attachments}
        :{provider:view.chat.provider,chatId:view.chat.id,text,permission,requestId,attachments});
      setDrafts(old=>({...old,[id]:old[id]===text?'':old[id]}));
      setFiles(old=>({...old,[id]:(old[id] || []).filter(f=>!sentFiles.some(s=>s.id===f.id))}));
      for(const item of sentFiles)uploaded.current.delete(item.id);
      sendReceipt.current=null;
      if(selectedRef.current===id) {
        if(result.id && !result.queued)setTurn({id:result.id,chatId:view.chat.id,status:'thinking',startedAt:Date.now(),transcript:text});
        await refreshHistory(id);
      }
    } catch(e){fail(e as Error);}finally{setBusy(false);}
  }
  async function stop() {
    if(!view)return;
    try {await api(`chats/${encodeURIComponent(view.chat.id)}/stop`,{});setTurn(null);await refreshHistory(selected!);}
    catch(e){fail(e as Error);}
  }
  async function changePermission(value:Permission) {
    if(!view || !selected)return;setBusy(true);
    try {await api('selection',{chatId:view.chat.id,provider:view.chat.provider,permission:value});setPermissions(old=>({...old,[selected]:value}));}
    catch(e){fail(e as Error);}finally{setBusy(false);}
  }
  const sessions=[...new Map(chats.map(chat=>{const row=session(chat);return [`${row.provider}:${row.id}`,row] as const;})).values()];
  const working=turn?.status==='thinking' || view?.running;
  const streamedReply=turn?.reply ?? (turn?.liveText?{text:turn.liveText}:undefined);
  const liveReply=turn?.status==='thinking' && streamedReply && !view?.messages.some(m=>m.role==='assistant' && m.text===streamedReply.text && m.timestamp>=(turn.startedAt || 0));
  return <TooltipProvider><div className="notch-app"><HandoffHalo/>
    <ChatSidebar chats={[]} activeChat={selected} activeSession={view?{provider:view.chat.provider,id:view.chat.sessionId || view.chat.id}:undefined} onChatSelect={id=>void choose(id)} onChatCreate={()=>void create()}
      onChatDelete={()=>{}} onChatRename={()=>{}} isCollapsed={collapsed} onToggleCollapse={()=>setCollapsed(v=>!v)}
      theme="dark" platform="win32" externalSessions={sessions} runningSessions={running.map(session)}
      onOpenAgentSession={s=>{const chat=chats.find(c=>c.provider===s.provider && (c.sessionId===s.id || c.id===s.id));void choose(chat?.id || `${s.provider}:${s.id}`);}} onSearchChats={searchChats}/>
    <main onDragOver={event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();}} onDropCapture={event=>{if(event.dataTransfer.files.length){event.preventDefault();event.stopPropagation();attach(event.dataTransfer.files);}}}>
      <header><strong>Ally</strong><span className="title" title="This chat stays selected when the notch collapses">{view?.chat.title || 'Chats'}</span>
        <select aria-label="Engine for new chats" value={provider} onChange={e=>setProvider(e.target.value as Provider)}><option value="codex">Codex</option><option value="claude">Claude</option></select>
        <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void discover()}>Refresh</Button>
      </header>
      <PendingDecisions api={api}/>
      {error && <div role="alert" className="error">{error}<Button size="sm" variant="ghost" onClick={()=>{setError('');void (selected?refreshHistory(selected).catch(fail):discover());}}>Retry</Button></div>}
      <div ref={listRef} className="transcript" onScroll={()=>{const e=listRef.current!;nearBottom.current=e.scrollHeight-e.scrollTop-e.clientHeight<80;}}>
        {loading && <p role="status">Loading conversation…</p>}
        {!selected && <div className="empty"><h1>{greeting || 'Ally'}</h1><p>Select a chat or start one with {provider==='codex'?'Codex':'Claude'}.</p><Button onClick={()=>void create()} disabled={busy}>New chat</Button></div>}
        {view?.before!=null && <Button size="sm" variant="ghost" onClick={()=>void refreshHistory(selected!,view.before!).catch(fail)}>Load earlier messages</Button>}
        {view?.messages.map(message=><article key={message.id} className={message.role==='user'?'user-message':'assistant-message'}>
          {message.role==='user'?<CompactUserMessage content={message.text}/>:<AgentReply text={replyText(message)}/>}
          {message.attachments?.map(asset=><AttachmentView key={asset.id} asset={asset}/>)}
          {!!message.steps?.length && <details><summary>Activity · {message.steps.length}</summary>{message.steps.map(s=><pre key={s.id}>{s.name} · {s.status}{'\n'}{s.detail}</pre>)}</details>}
        </article>)}
        {turn?.status==='thinking' && turn.transcript && !view?.messages.some(m=>m.role==='user' && m.text===turn.transcript && m.timestamp>=(turn.startedAt || 0)) && <article className="user-message"><CompactUserMessage content={turn.transcript}/></article>}
        {liveReply && <article className="assistant-message"><AgentReply text={replyText(streamedReply!)} streaming={turn?.status==='thinking'}/></article>}
        {working && <p role="status">{turn?.activity || 'Working…'}</p>}
        {!!view?.queue?.items.length && <details open><summary>Queued · {view.queue.items.length}</summary>{view.queue.items.map(item=><div key={item.id} className="user-message"><p>{item.text}</p><small>{item.state}{item.error?` · ${item.error}`:''}</small></div>)}</details>}
      </div>
      {offsets.codex!==null || offsets.claude!==null ? <Button className="more-chats" size="sm" variant="ghost" onClick={()=>void discover(true)}>Load more chats</Button>:null}
      {selected && <footer><div className="composer-meta"><span title={view?.chat.cwd}>{view?.chat.provider || provider} · {view?.chat.cwd?.split(/[\\/]/).pop() || 'Home'}</span>
        <select aria-label="Permission for this chat" value={permission} disabled={busy || !!working} onChange={e=>void changePermission(e.target.value as Permission)}><option value="readonly">Read only</option><option value="edit">Can edit</option><option value="full">Full access</option></select>
        {working && <Button size="sm" variant="ghost" disabled={!view?.canStop} title={!view?.canStop?'Continue in the original app to stop this response':undefined} onClick={()=>void stop()}>Stop</Button>}
      </div><div className="draft-attachments">{draftFiles.map(item=><Button type="button" key={item.id} size="sm" variant="ghost" disabled={busy} title="Remove attachment" onClick={()=>{uploaded.current.delete(item.id);setFiles(old=>({...old,[selected!]:(old[selected!] || []).filter(f=>f.id!==item.id)}));}}>{item.file.name} Remove</Button>)}</div><PromptInput onSubmit={()=>void send()}><PromptInputTextarea value={input} onChange={e=>setDrafts(old=>({...old,[selected]:e.target.value}))} onPasteCapture={event=>{if(event.clipboardData.files.length){event.preventDefault();event.stopPropagation();attach(event.clipboardData.files);}}} placeholder={working?'Queue a follow-up…':greeting || 'Ask Ally…'} disabled={loading || !view}/><PromptInputFooter><span className="hint">{working?'Queues to this chat':'Enter to send · Shift+Enter for a new line'}</span><input ref={filePicker} type="file" multiple hidden onChange={event=>{if(event.target.files)attach(event.target.files);event.target.value='';}}/><Button type="button" size="sm" variant="ghost" aria-label="Attach files" disabled={busy || loading || !view} onClick={()=>filePicker.current?.click()}>Attach</Button><PromptInputSubmit disabled={busy || loading || !view || (!input.trim() && !draftFiles.length)}/></PromptInputFooter></PromptInput></footer>}
    </main>
  </div></TooltipProvider>;
}
// Keep transcript links inside the native host. Display their URL for copying.
document.addEventListener('click',event=>{const link=(event.target as Element).closest?.('a');if(link && !link.download){event.preventDefault();void navigator.clipboard.writeText(link.href).catch(()=>{});}});
createRoot(document.getElementById('root')!).render(<ChatSurfaceBoundary>{homePreview ? <NotchHome api={api}/> : <App/>}</ChatSurfaceBoundary>);
