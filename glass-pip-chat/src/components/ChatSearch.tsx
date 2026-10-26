import { memo, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatSearchHit {
  provider: 'claude' | 'codex';
  id: string;
  title: string;
  folder?: string;
  updatedAt: number;
  snippet: string;
}
/** `pending` = transcripts still being read; titles are already searched. */
export interface ChatSearchResult { hits: ChatSearchHit[]; pending: number }
export type SearchChats = (query: string) => Promise<ChatSearchResult>;

const DEBOUNCE_MS = 180;
const PENDING_RETRY_MS = 1500;
const PENDING_RETRIES = 4;
const TAG = { claude: 'Claude', codex: 'Codex' };

/** The desktop window's read-only search over Ally's chat index (electron/chatsMcp). */
export const desktopSearchChats: SearchChats = query => window.pip.chatsMcp.search(query);
export const hasDesktopSearch = () => typeof window !== 'undefined' && typeof window.pip?.chatsMcp?.search === 'function';

const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;

function age(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  const days = Math.floor(mins / 1440);
  return days < 7 ? `${days}d` : `${Math.floor(days / 7)}w`;
}

interface ChatSearchProps {
  search: SearchChats;
  onOpen: (hit: ChatSearchHit) => void;
  /** Called when the query turns non-empty or empty, so the sidebar can swap its list for results. */
  onActiveChange: (active: boolean) => void;
  /** Non-zero asks for focus (shortcut or rail icon); acknowledged with onFocused. */
  focusRequest: number;
  onFocused: () => void;
}

/**
 * Search field plus results. Keystrokes only re-render this component; the
 * sidebar hears about it when the query becomes empty or non-empty.
 */
function ChatSearch({ search, onOpen, onActiveChange, focusRequest, onFocused }: ChatSearchProps) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ChatSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = query.trim() !== '';

  useEffect(() => { onActiveChange(active); }, [active, onActiveChange]);
  useEffect(() => () => onActiveChange(false), [onActiveChange]);

  useEffect(() => {
    if (!focusRequest) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    onFocused();
  }, [focusRequest, onFocused]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResult(null); setLoading(false); setError(''); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let retries = 0;
    const run = async () => {
      try {
        const next = await search(q);
        if (cancelled) return;
        setResult(next);
        setError('');
        setSelected(i => Math.min(i, Math.max(next.hits.length - 1, 0)));
        // Full-text matches arrive as the index finishes reading transcripts
        if (next.pending > 0 && retries++ < PENDING_RETRIES) timer = setTimeout(run, PENDING_RETRY_MS);
        else setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error)?.message || 'Search is unavailable right now.');
        setLoading(false);
      }
    };
    setLoading(true);
    timer = setTimeout(run, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, search]);

  const hits = active ? result?.hits ?? [] : [];
  const open = (hit: ChatSearchHit) => { onOpen(hit); setQuery(''); setSelected(0); };

  return (
    <>
      <div className="shrink-0 px-2 pb-1">
        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 focus-within:border-white/25">
          {loading ? <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-foreground/45" /> : <Search aria-hidden="true" className="size-3.5 shrink-0 text-foreground/45" />}
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={e => {
              if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); }
              else if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); setSelected(i => (i + 1) % hits.length); }
              else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); setSelected(i => (i - 1 + hits.length) % hits.length); }
              else if (e.key === 'Enter' && hits[selected]) { e.preventDefault(); open(hits[selected]); }
            }}
            placeholder="Search chats"
            aria-label="Search chats"
            aria-controls={active ? 'ally-chat-search-results' : undefined}
            aria-activedescendant={hits[selected] ? `ally-chat-search-${selected}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-light text-foreground outline-none placeholder:text-foreground/35 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear search" className="grid size-4 shrink-0 place-items-center rounded text-foreground/45 hover:text-foreground"><X className="size-3" /></button>}
        </label>
      </div>
      {active && (
        <div id="ally-chat-search-results" role="listbox" aria-label="Search results" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
          {hits.map((hit, i) => (
            <button
              key={`${hit.provider}:${hit.id}`}
              id={`ally-chat-search-${i}`}
              type="button"
              role="option"
              aria-selected={i === selected}
              onClick={() => open(hit)}
              onMouseEnter={() => setSelected(i)}
              title={hit.folder ? `${hit.title}\n${hit.folder}` : hit.title}
              className={cn('flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors', i === selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]')}
            >
              <span className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">{hit.title || 'Untitled'}</span>
                <span className="shrink-0 font-mono text-[10px] text-foreground/30">{age(hit.updatedAt)}</span>
              </span>
              <span className="block truncate text-[10px] text-foreground/40">{TAG[hit.provider]}{hit.folder ? ` · ${folderName(hit.folder)}` : ''}</span>
              {hit.snippet && <span className="line-clamp-2 text-[11px] leading-snug text-foreground/55">{hit.snippet}</span>}
            </button>
          ))}
          {error && <p role="alert" className="px-2.5 py-2 text-[11px] text-amber-200">{error}</p>}
          {!error && result && !hits.length && !loading && <p className="px-2.5 py-2 text-[11px] text-foreground/40">No chats match “{query.trim()}”.</p>}
          {!error && result && result.pending > 0 && <p role="status" className="px-2.5 py-2 text-[11px] text-foreground/40">Reading {result.pending} more chats…</p>}
        </div>
      )}
    </>
  );
}

export default memo(ChatSearch);
