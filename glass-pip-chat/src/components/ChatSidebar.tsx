import { useDiscoveryReadStates } from '@/hooks/useUnreadChats';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Folder, LoaderCircle, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Play, Square, SquarePen, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Chat } from '@/types/chat';
import type { AgentSessionSummary } from '@/types/agent';

interface ChatSidebarProps {
  chats: Chat[];
  activeChat: string | null;
  onChatSelect: (chatId: string) => void;
  onChatCreate: () => void;
  onChatDelete: (chatId: string) => void;
  onChatRename: (chatId: string, newTitle: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  theme: 'light' | 'dark';
  platform: string;
  homeCwd?: string;
  runningChatId?: string | null;
  workingStatus?: string;
  onStop?: () => void;
  onResume?: () => void;
  /** Sessions from the Claude Code / Codex apps, listed alongside Ally's chats */
  externalSessions?: AgentSessionSummary[];
  runningSessions?: AgentSessionSummary[];
  runningError?: string;
  /** Continue an existing Claude Code / Codex session as a chat */
  onOpenAgentSession?: (session: AgentSessionSummary) => void;
}

type Entry =
  | { kind: 'chat'; chat: Chat; updatedAt: number }
  | { kind: 'session'; session: AgentSessionSummary; updatedAt: number };

/** Every unread session remains reachable, even outside the loaded history page. */
export function recentEntries(entries: Entry[], unreadKeys: ReadonlySet<string>): Entry[] {
  const keys=(entry: Entry) => entry.kind==='session'
    ? [entry.session.id,entry.session.originalSessionId].filter(Boolean).map(id=>`${entry.session.provider}:${id}`)
    : entry.chat.agent ? [entry.chat.agent.sessionId,entry.chat.agent.originalSessionId].filter(Boolean).map(id=>`${entry.chat.agent!.provider}:${id}`) : [];
  const known=new Set(entries.flatMap(keys));
  const missing: Entry[]=[...unreadKeys].filter(key=>!known.has(key)).flatMap(key=>{
    const match=/^(codex|claude):([\w-]+)$/.exec(key);
    return match ? [{kind:'session' as const,session:{provider:match[1] as 'codex'|'claude',id:match[2],title:'Unread conversation',updatedAt:0},updatedAt:0}] : [];
  });
  const created = (entry: Entry) => entry.kind === 'chat' ? entry.chat.createdAt : entry.session.createdAt ?? 0;
  const identity = (entry: Entry) => entry.kind === 'chat' ? entry.chat.id : `${entry.session.provider}:${entry.session.id}`;
  return [...entries,...missing].sort((a,b)=>created(b)-created(a) || identity(b).localeCompare(identity(a)));
}

interface ProjectGroup {
  key: string;
  name: string;
  path?: string;
  entries: Entry[];
  updatedAt: number;
  provider: 'claude' | 'codex' | 'unassigned';
}

const NO_FOLDER = '__none__';
const COLLAPSED_GROUPS_KEY = 'ally-sidebar-collapsed-projects';
const RECENT_OPEN_KEY = 'ally-sidebar-recent-open';
const ROWS_BEFORE_MORE = 6;
const PROVIDER_TAG = { claude: 'Claude', codex: 'Codex', unassigned: 'No engine' };

/** Same folder regardless of slash direction, case (Windows) or trailing slash */
const folderKey = (p: string) => p.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();

function folderName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

function relativeTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : `${Math.floor(days / 7)}w`;
}

/**
 * Working folders within separate engine sections, newest first. A linked
 * session (including its migration alias) appears once as its Ally chat.
 */
export function groupByProject(chats: Chat[], sessions: AgentSessionSummary[], homeCwd?: string): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  const add = (cwd: string | undefined, entry: Entry, provider: ProjectGroup['provider']) => {
    const key = `${provider}:${cwd ? folderKey(cwd) : NO_FOLDER}`;
    const home = cwd && homeCwd && folderKey(cwd) === folderKey(homeCwd);
    const group = groups.get(key) ?? { key, provider, name: home ? 'Home' : cwd ? folderName(cwd) : 'No working folder', path: cwd, entries: [], updatedAt: 0 };
    group.entries.push(entry);
    group.updatedAt = Math.max(group.updatedAt, entry.updatedAt);
    groups.set(key, group);
  };
  const linked = new Set(chats.flatMap(c => [c.agent?.sessionId, c.agent?.originalSessionId].filter(Boolean).map(id => `${c.agent?.provider}:${id}`)));
  for (const saved of chats) {
    const native = sessions.find(s => s.provider === saved.agent?.provider && (s.id === saved.agent?.sessionId || s.id === saved.agent?.originalSessionId));
    const chat = native?.createdAt ? { ...saved, createdAt: native.createdAt } : saved;
    add(chat.agent?.cwd, { kind: 'chat', chat, updatedAt: chat.createdAt }, chat.agent?.provider ?? 'unassigned');
  }
  for (const session of sessions) {
    if (!linked.has(`${session.provider}:${session.id}`) && !(session.originalSessionId && linked.has(`${session.provider}:${session.originalSessionId}`))) add(session.cwd, { kind: 'session', session, updatedAt: session.createdAt ?? 0 }, session.provider);
  }
  for (const g of groups.values()) g.entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return [...groups.values()].sort((a, b) => a.provider.localeCompare(b.provider) || b.updatedAt - a.updatedAt);
}

/** A Claude Code / Codex session not yet opened in Ally; clicking continues it here. */
function SessionRow({ session, onOpen, unread = false }: { session: AgentSessionSummary; onOpen: () => void; unread?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${session.title}\nFrom ${session.provider === 'claude' ? 'Claude Code' : 'Codex'} · click to continue in Ally`}
      className="flex w-full items-center rounded-md text-left text-foreground/55 transition-colors hover:bg-white/[0.05] hover:text-foreground"
    >
      <span className="min-w-0 flex-1 truncate py-1.5 pl-2.5 pr-1 text-[13px] font-light">{session.title}</span>
      {unread && <UnreadDot />}
      <span className="shrink-0 pr-1 font-mono text-[9px] uppercase tracking-[0.1em] text-foreground/30">{PROVIDER_TAG[session.provider]}</span>
      <span className="shrink-0 pr-2 font-mono text-[10px] text-foreground/30">{relativeTime(session.updatedAt)}</span>
    </button>
  );
}

export function runningEntries(chats: Chat[], sessions: AgentSessionSummary[], runningChatId?: string | null): Entry[] {
  const entries = new Map<string, Entry>();
  for (const session of sessions) {
    const chat = chats.find(c => c.agent?.provider === session.provider && [c.agent.sessionId, c.agent.originalSessionId].filter(Boolean).some(id => id === session.id || id === session.originalSessionId));
    const entry: Entry = chat ? { kind: 'chat', chat, updatedAt: session.updatedAt } : { kind: 'session', session, updatedAt: session.updatedAt };
    entries.set(chat ? `chat:${chat.id}` : `${session.provider}:${session.id}`, entry);
  }
  const local = chats.find(c => c.id === runningChatId);
  if (local) entries.set(`chat:${local.id}`, { kind: 'chat', chat: local, updatedAt: local.updatedAt });
  return [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_GROUPS_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function ChatRow({
  chat,
  active,
  onSelect,
  onRename,
  onDelete,
  canDelete,
  workingStatus,
  onStop,
  onResume,
  unread = false,
}: {
  chat: Chat;
  unread?: boolean;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  canDelete: boolean;
  workingStatus?: string;
  onStop?: () => void;
  onResume?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chat.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== chat.title) onRename(draft.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(chat.title); setEditing(false); }
        }}
        className="mx-1 w-[calc(100%-0.5rem)] rounded-md border border-ring bg-transparent px-2 py-1 text-[13px] font-light outline-none"
      />
    );
  }

  return (
    <div
      className={cn(
        'group/row relative flex items-center rounded-md transition-colors',
        active ? 'bg-white/[0.09] text-foreground' : 'text-foreground/70 hover:bg-white/[0.05] hover:text-foreground'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => setEditing(true)}
        className="min-w-0 flex-1 truncate py-1.5 pl-2.5 pr-1 text-left text-[13px] font-light"
        title={`${chat.title}\n${PROVIDER_TAG[chat.agent?.provider ?? 'unassigned']}${chat.agent?.originalSessionId ? '\nContinues an original Codex chat; original history retained.' : ''}`}
      >
        <span className="block truncate">{chat.title || 'Untitled'}</span>
        {workingStatus && <span role="status" className="mt-0.5 flex items-center gap-1 text-[10px] text-foreground/70"><LoaderCircle aria-hidden="true" className="size-3 shrink-0 animate-spin" /><span className="truncate">{workingStatus}</span></span>}
      </button>
      {unread && !workingStatus && <UnreadDot />}
      {!workingStatus && active && onResume && <button type="button" onClick={onResume} aria-label={`Resume ${chat.title || 'Untitled'}`} title="Resume response" className="mr-1 grid size-7 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-foreground/80 hover:bg-white/15"><Play aria-hidden="true" className="size-3" /></button>}
      {workingStatus && onStop && <button type="button" onClick={onStop} aria-label={`Stop ${chat.title || 'Untitled'}`} title="Stop response" className="mr-1 grid size-7 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-foreground/70 hover:bg-white/15 hover:text-foreground"><Square aria-hidden="true" className="size-2.5" fill="currentColor" /></button>}
      <span className="shrink-0 pr-1.5 text-[10px] text-foreground/45">{PROVIDER_TAG[chat.agent?.provider ?? 'unassigned']}</span>
      {!workingStatus && <span className="shrink-0 pr-2 font-mono text-[10px] text-foreground/30 group-hover/row:hidden">{relativeTime(chat.updatedAt)}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="mr-1 hidden size-5 shrink-0 place-items-center rounded text-foreground/50 hover:bg-white/10 hover:text-foreground group-hover/row:grid data-[state=open]:grid"
            title="More"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Rename
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 className="size-3.5" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Familiar folder layout, separated by large Claude and Codex headers. */
export default function ChatSidebar({
  chats,
  activeChat,
  onChatSelect,
  onChatCreate,
  onChatDelete,
  onChatRename,
  isCollapsed,
  onToggleCollapse,
  externalSessions = [],
  runningSessions = [],
  runningError = '',
  onOpenAgentSession,
  homeCwd,
  runningChatId,
  workingStatus = 'Working…',
  onStop,
  onResume,
}: ChatSidebarProps) {
  const { keys: unreadKeys, hidden } = useDiscoveryReadStates(chats.flatMap(c => [c.agent?.sessionId, c.agent?.originalSessionId].filter(Boolean).map(id => `${c.agent!.provider}:${id}`)));
  const visibleChats = useMemo(() => chats.filter(c => !c.agent || ![c.agent.sessionId, c.agent.originalSessionId].some(id => id && hidden.has(`${c.agent!.provider}:${id}`))), [chats, hidden]);
  const chatUnread = (chat: Chat) => !!chat.agent && [chat.agent.sessionId, chat.agent.originalSessionId].some(id => id && unreadKeys.has(`${chat.agent!.provider}:${id}`));
  const entryUnread = (entry: Entry) => entry.kind === 'chat' ? chatUnread(entry.chat) : unreadKeys.has(`${entry.session.provider}:${entry.session.id}`);
  const visibleExternal = useMemo(() => externalSessions.filter(s => ![s.id, s.originalSessionId].some(id => id && hidden.has(`${s.provider}:${id}`))), [externalSessions, hidden]);
  const visibleRunning = runningSessions.filter(s => ![s.id, s.originalSessionId].some(id => id && hidden.has(`${s.provider}:${id}`)));
  const groups = useMemo(() => groupByProject(visibleChats, visibleExternal, homeCwd), [visibleChats, visibleExternal, homeCwd]);
  const running = runningEntries(visibleChats, visibleRunning, runningChatId);
  const recent = recentEntries(groups.flatMap(g => g.entries),unreadKeys);
  const quickRow = (entry: Entry, live: boolean) => {
    const item = entry.kind === 'chat' ? entry.chat : entry.session;
    const provider = entry.kind === 'chat' ? entry.chat.agent?.provider : entry.session.provider;
    const cwd = entry.kind === 'chat' ? entry.chat.agent?.cwd : entry.session.cwd;
    return <button key={`${entry.kind}:${provider}:${item.id}`} type="button" onClick={() => entry.kind === 'chat' ? onChatSelect(entry.chat.id) : onOpenAgentSession?.(entry.session)} className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-white/[0.05]">
      {!live && entryUnread(entry) && <UnreadDot />}
      {live && <LoaderCircle aria-hidden="true" className="mt-0.5 size-3 shrink-0 animate-spin text-amber-200/70" />}
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-foreground/85">{item.title || 'Untitled'}</span><span className="block truncate text-[10px] text-foreground/40">{PROVIDER_TAG[provider ?? 'unassigned']}{cwd ? ` · ${folderName(cwd)}` : ''}</span></span>
    </button>;
  };
  const [collapsedGroups, setCollapsedGroups] = useState(loadCollapsed);
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [recentOpen, setRecentOpen] = useState(() => {
    try { return localStorage.getItem(RECENT_OPEN_KEY) === 'true'; } catch { return false; }
  });
  const [showAllRecent, setShowAllRecent] = useState(false);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const railButton = 'grid size-8 place-items-center rounded-md text-foreground/60 transition-colors hover:bg-white/[0.07] hover:text-foreground';

  return (
    <motion.nav
      initial={false}
      animate={{ width: isCollapsed ? 48 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex h-full flex-col overflow-hidden border-r border-border bg-black/30"
      aria-label="Chats"
    >
      {/* Top: sidebar toggle + New chat */}
      <div className={cn('flex shrink-0 flex-col gap-0.5 p-2', isCollapsed && 'items-center')}>
        <button type="button" onClick={onToggleCollapse} className={railButton} title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
        <button
          type="button"
          onClick={onChatCreate}
          title="New chat"
          className={cn(
            isCollapsed ? railButton : 'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground/85 transition-colors hover:bg-white/[0.07] hover:text-foreground'
          )}
        >
          <SquarePen className="size-4 shrink-0" />
          {!isCollapsed && 'New chat'}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
            <section aria-label="Running chats" className="pb-3">
              <h2 className="px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-foreground/50">Running · {running.length}</h2>
              {running.map(entry => quickRow(entry, true))}
              {runningError && <p className="px-2.5 py-2 text-[11px] text-foreground/40">{runningError}</p>}
              {!runningError && running.length === 0 && <p className="px-2.5 py-2 text-[11px] text-foreground/40">No active chats</p>}
            </section>
            <section aria-label="Recent chats" className="border-t border-border pb-2">
              <button
                type="button"
                aria-expanded={recentOpen}
                aria-controls="ally-sidebar-recent-chats"
                onClick={() => setRecentOpen(open => {
                  const next = !open;
                  try { localStorage.setItem(RECENT_OPEN_KEY, String(next)); } catch { /* Still usable without storage. */ }
                  return next;
                })}
                className="group/proj flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground/80 transition-colors hover:bg-white/[0.05]"
              >
                <Folder className="size-4 shrink-0 text-foreground/50 group-hover/proj:hidden" />
                <ChevronRight className={cn('hidden size-4 shrink-0 text-foreground/50 transition-transform group-hover/proj:block', recentOpen && 'rotate-90')} />
                <span className="truncate">Recent & unread</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-foreground/40">{recent.length}</span>
                {recent.some(entryUnread) && <UnreadDot />}
              </button>
              {recentOpen && <div id="ally-sidebar-recent-chats" className="ml-[18px] border-l border-border pl-1.5">
                {(showAllRecent ? recent : recent.slice(0, ROWS_BEFORE_MORE)).map(entry => quickRow(entry, false))}
                {recent.length > ROWS_BEFORE_MORE && <button
                  type="button"
                  onClick={() => setShowAllRecent(all => !all)}
                  className="w-full rounded-md py-1 pl-2.5 text-left text-[11px] text-foreground/40 transition-colors hover:text-foreground/70"
                >{showAllRecent ? 'View less' : `View more (${recent.length - ROWS_BEFORE_MORE})`}</button>}
              </div>}
            </section>
            {groups.map((group, index) => {
              const hasRunningChat = group.entries.some(entry => entry.kind === 'chat' && entry.chat.id === runningChatId);
              const closed = collapsedGroups.has(group.key) && !hasRunningChat;
              const expandedAll = showAll.has(group.key);
              const shown = expandedAll ? group.entries : group.entries.filter((entry, i) => i < ROWS_BEFORE_MORE || (entry.kind === 'chat' && entry.chat.id === runningChatId));
              const hiddenCount = group.entries.length - shown.length;
              return (
                <div key={group.key} className="mb-1">
                  {(index === 0 || groups[index - 1].provider !== group.provider) && (
                    <div className="px-2.5 pb-1 pt-4">
                      <h2 className="text-[17px] font-semibold tracking-tight text-foreground/90">{group.provider === 'unassigned' ? 'Ally' : PROVIDER_TAG[group.provider]}</h2>
                      <p className="mt-0.5 text-[10px] text-foreground/40" title="Grouped by where the agent works, independently of saved Codex projects">{group.provider === 'unassigned' ? 'Choose an engine to start' : 'Working folders'}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    title={group.path ? `Working folder: ${group.path}` : 'Chats without a working folder'}
                    className="group/proj flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground/80 transition-colors hover:bg-white/[0.05]"
                  >
                    <Folder className="size-4 shrink-0 text-foreground/50 group-hover/proj:hidden" />
                    <ChevronRight className={cn('hidden size-4 shrink-0 text-foreground/50 transition-transform group-hover/proj:block', !closed && 'rotate-90')} />
                    <span className="truncate">{group.name}</span>
                  </button>
                  {!closed && (
                    <div className="ml-[18px] border-l border-border pl-1.5">
                      {shown.map(entry =>
                        entry.kind === 'chat' ? (
                          <ChatRow
                            key={entry.chat.id}
                            chat={entry.chat}
                            unread={chatUnread(entry.chat)}
                            active={entry.chat.id === activeChat}
                            onSelect={() => onChatSelect(entry.chat.id)}
                            onRename={title => onChatRename(entry.chat.id, title)}
                            onDelete={() => onChatDelete(entry.chat.id)}
                            canDelete={chats.length > 1 && entry.chat.id !== runningChatId}
                            workingStatus={entry.chat.id === runningChatId ? workingStatus : undefined}
                            onStop={onStop}
                            onResume={onResume}
                          />
                        ) : (
                          <SessionRow unread={unreadKeys.has(`${entry.session.provider}:${entry.session.id}`)}
                            key={entry.session.provider + entry.session.id}
                            session={entry.session}
                            onOpen={() => onOpenAgentSession?.(entry.session)}
                          />
                        )
                      )}
                      {(hiddenCount > 0 || expandedAll) && group.entries.length > ROWS_BEFORE_MORE && (
                        <button
                          type="button"
                          onClick={() => setShowAll(prev => {
                            const next = new Set(prev);
                            if (next.has(group.key)) next.delete(group.key);
                            else next.add(group.key);
                            return next;
                          })}
                          className="w-full rounded-md py-1 pl-2.5 text-left text-[11px] text-foreground/40 transition-colors hover:text-foreground/70"
                        >
                          {expandedAll ? 'Show less' : `Show ${hiddenCount} more`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </>
      )}
    </motion.nav>
  );
}

function UnreadDot() { return <span role="img" aria-label="Unread reply" title="Unread reply" className="mx-1 inline-block size-1.5 shrink-0 rounded-full bg-blue-400" />; }
