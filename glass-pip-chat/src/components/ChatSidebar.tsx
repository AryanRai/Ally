import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Folder, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, SquarePen, Trash2 } from 'lucide-react';
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
  /** Sessions from the Claude Code / Codex apps, listed alongside Ally's chats */
  externalSessions?: AgentSessionSummary[];
  /** Continue an existing Claude Code / Codex session as a chat */
  onOpenAgentSession?: (session: AgentSessionSummary) => void;
}

type Entry =
  | { kind: 'chat'; chat: Chat; updatedAt: number }
  | { kind: 'session'; session: AgentSessionSummary; updatedAt: number };

interface ProjectGroup {
  key: string;
  name: string;
  path?: string;
  entries: Entry[];
  updatedAt: number;
}

const NO_FOLDER = '__none__';
const COLLAPSED_GROUPS_KEY = 'ally-sidebar-collapsed-projects';
const ROWS_BEFORE_MORE = 6;
const PROVIDER_TAG: Record<AgentSessionSummary['provider'], string> = { claude: 'cc', codex: 'cx' };

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
 * Ally chats and Claude Code / Codex sessions grouped by project folder, newest
 * first (like Codex's Projects). A session already continued in Ally shows once, as its chat.
 */
function groupByProject(chats: Chat[], sessions: AgentSessionSummary[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  const add = (cwd: string | undefined, entry: Entry) => {
    const key = cwd ? folderKey(cwd) : NO_FOLDER;
    const group = groups.get(key) ?? { key, name: cwd ? folderName(cwd) : 'Chats', path: cwd, entries: [], updatedAt: 0 };
    group.entries.push(entry);
    group.updatedAt = Math.max(group.updatedAt, entry.updatedAt);
    groups.set(key, group);
  };
  const linked = new Set(chats.map(c => c.agent?.sessionId).filter(Boolean));
  for (const chat of chats) add(chat.agent?.cwd, { kind: 'chat', chat, updatedAt: chat.updatedAt });
  for (const session of sessions) {
    if (!linked.has(session.id)) add(session.cwd, { kind: 'session', session, updatedAt: session.updatedAt });
  }
  for (const g of groups.values()) g.entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return [...groups.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** A Claude Code / Codex session not yet opened in Ally; clicking continues it here. */
function SessionRow({ session, onOpen }: { session: AgentSessionSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${session.title}\nFrom ${session.provider === 'claude' ? 'Claude Code' : 'Codex'} · click to continue in Ally`}
      className="flex w-full items-center rounded-md text-left text-foreground/55 transition-colors hover:bg-white/[0.05] hover:text-foreground"
    >
      <span className="min-w-0 flex-1 truncate py-1.5 pl-2.5 pr-1 text-[13px] font-light">{session.title}</span>
      <span className="shrink-0 pr-1 font-mono text-[9px] uppercase tracking-[0.1em] text-foreground/30">{PROVIDER_TAG[session.provider]}</span>
      <span className="shrink-0 pr-2 font-mono text-[10px] text-foreground/30">{relativeTime(session.updatedAt)}</span>
    </button>
  );
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
}: {
  chat: Chat;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  canDelete: boolean;
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
        title={chat.title}
      >
        {chat.title || 'Untitled'}
      </button>
      <span className="shrink-0 pr-2 font-mono text-[10px] text-foreground/30 group-hover/row:hidden">{relativeTime(chat.updatedAt)}</span>
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

/** Chat list in the style of the Codex / Claude Code apps: New chat, then chats under their project folders. */
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
  onOpenAgentSession,
}: ChatSidebarProps) {
  const groups = useMemo(() => groupByProject(chats, externalSessions), [chats, externalSessions]);
  const [collapsedGroups, setCollapsedGroups] = useState(loadCollapsed);
  const [showAll, setShowAll] = useState<Set<string>>(new Set());

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
            <p className="px-2.5 pb-1 pt-2 text-[11px] text-foreground/40">Projects</p>
            {groups.map(group => {
              const closed = collapsedGroups.has(group.key);
              const expandedAll = showAll.has(group.key);
              const shown = expandedAll ? group.entries : group.entries.slice(0, ROWS_BEFORE_MORE);
              const hiddenCount = group.entries.length - shown.length;
              return (
                <div key={group.key} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    title={group.path ?? 'Chats without a working folder'}
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
                            active={entry.chat.id === activeChat}
                            onSelect={() => onChatSelect(entry.chat.id)}
                            onRename={title => onChatRename(entry.chat.id, title)}
                            onDelete={() => onChatDelete(entry.chat.id)}
                            canDelete={chats.length > 1}
                          />
                        ) : (
                          <SessionRow
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
