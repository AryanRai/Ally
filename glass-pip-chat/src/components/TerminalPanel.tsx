/**
 * TerminalPanel.tsx — Cursor-style glass terminal panel with named session tabs.
 *
 * Toggle with Ctrl+Shift+` (global shortcut registered in main.ts) or
 * via the `toggle-terminal` IPC event / `showTerminal` prop.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │ [General ×] [Build] [Robot ●] [+ New]    │  ← Tab bar
 *   ├──────────────────────────────────────────┤
 *   │ $ npm run dev                            │
 *   │ > Local: http://localhost:5173           │
 *   │ ▋                                        │
 *   └──────────────────────────────────────────┘
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  TerminalSession,
  terminalSessionManager,
  PRESET_SESSIONS,
} from '../services/terminalSessionManager';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TerminalPanelProps {
  /** Whether the panel is currently visible */
  visible: boolean;
  onClose?: () => void;
  /** Optional CSS class for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  visible,
  onClose,
  className,
}) => {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState('');
  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Initialise sessions & wire IPC/manager events
  // -------------------------------------------------------------------------

  const refreshSessions = useCallback(() => {
    setSessions(terminalSessionManager.listSessions());
  }, []);

  useEffect(() => {
    // Ensure preset sessions exist
    const init = async () => {
      for (const p of PRESET_SESSIONS) {
        await terminalSessionManager.getOrCreateSession(p.name);
      }
      refreshSessions();
      const all = terminalSessionManager.listSessions();
      if (all.length > 0) setActiveSessionId(all[0].id);
    };
    init();

    // Subscribe to session metadata changes
    const unsubUpdate = terminalSessionManager.onSessionUpdate(() => {
      refreshSessions();
    });

    return () => {
      unsubUpdate();
    };
  }, [refreshSessions]);

  // -------------------------------------------------------------------------
  // Wire IPC toggle event from main process
  // -------------------------------------------------------------------------

  useEffect(() => {
    const pip = (window as any).pip;
    if (!pip?.onToggleTerminal) return;
    const cleanup = pip.onToggleTerminal?.(() => {
      onClose?.();
    });
    return () => cleanup?.();
  }, [onClose]);

  // -------------------------------------------------------------------------
  // Auto-scroll on new output
  // -------------------------------------------------------------------------

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions, activeSessionId]);

  // Focus input when panel becomes visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  const handleNewSession = async () => {
    const name = `session-${sessions.length + 1}`;
    const s = await terminalSessionManager.createSession(name);
    refreshSessions();
    setActiveSessionId(s.id);
  };

  const handleCloseTab = async (
    e: React.MouseEvent | React.KeyboardEvent,
    sessionId: string
  ) => {
    e.stopPropagation();
    await terminalSessionManager.killSession(sessionId);
    const remaining = sessions.filter((s) => s.id !== sessionId);
    setSessions(remaining);
    if (activeSessionId === sessionId) {
      setActiveSessionId(remaining[0]?.id ?? null);
    }
  };

  const handleRunCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !commandInput.trim()) return;
    const cmd = commandInput.trim();
    setCommandInput('');
    await terminalSessionManager.executeInSession(activeSession.id, cmd);
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const statusDot = (s: TerminalSession) => {
    if (s.status === 'running') return <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />;
    if (s.status === 'error')   return <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />;
    return null;
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        'flex flex-col bg-black/40 backdrop-blur-md border-t border-white/10 select-none',
        className,
      )}
      style={{ fontFamily: 'monospace' }}
    >
      {/* ── Tab bar ── */}
      <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-0 border-b border-white/10 overflow-x-auto">
        <TerminalIcon className="w-3.5 h-3.5 text-white/40 mr-1.5 shrink-0" />

        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSessionId(s.id)}
            className={cn(
              'group flex items-center gap-1 px-2.5 py-1 text-xs rounded-t transition-colors shrink-0',
              activeSessionId === s.id
                ? 'bg-white/10 text-white/90'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5',
            )}
          >
            {statusDot(s)}
            <span className={s.color}>{s.name}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => handleCloseTab(e, s.id)}
              onKeyDown={(e) => e.key === 'Enter' && handleCloseTab(e, s.id)}
              className="ml-0.5 opacity-0 group-hover:opacity-100 text-white/40 hover:text-white/80 transition-opacity"
            >
              <X className="w-2.5 h-2.5" />
            </span>
          </button>
        ))}

        {/* New session button */}
        <button
          onClick={handleNewSession}
          className="ml-1 p-1 text-white/40 hover:text-white/70 hover:bg-white/5 rounded transition-colors"
          title="New session"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Close panel */}
        <button
          onClick={onClose}
          className="ml-auto p-1 text-white/30 hover:text-white/60 hover:bg-white/5 rounded transition-colors shrink-0"
          title="Close terminal"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Output area ── */}
      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0" style={{ maxHeight: '200px' }}>
        {activeSession ? (
          activeSession.outputBuffer.length === 0 ? (
            <span className="text-white/20 text-xs">No output yet.</span>
          ) : (
            activeSession.outputBuffer.map((line, i) => (
              <div key={i} className="text-xs text-green-300 leading-5 whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          )
        ) : (
          <span className="text-white/20 text-xs">No session selected.</span>
        )}
        <div ref={outputEndRef} />
      </div>

      {/* ── Command input ── */}
      <form
        onSubmit={handleRunCommand}
        className="flex items-center gap-1.5 px-3 py-1.5 border-t border-white/10"
      >
        <span className="text-white/40 text-xs select-none">$</span>
        <input
          ref={inputRef}
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
          placeholder={activeSession ? `Run command in [${activeSession.name}]…` : 'No session'}
          disabled={!activeSession}
          className="flex-1 bg-transparent text-xs text-white/90 placeholder-white/30 outline-none caret-white"
        />
      </form>
    </div>
  );
};

export default TerminalPanel;
