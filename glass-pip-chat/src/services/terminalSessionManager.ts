/**
 * terminalSessionManager.ts — Cursor-style named terminal session pool.
 *
 * Provides a registry of named terminal sessions.  Each session tracks its
 * output, status, and PID so the UI can display rolling output per session.
 *
 * This module runs in the **renderer** process and communicates with the
 * Electron main process via the `window.pip.terminal` IPC bridge exposed by
 * preload.ts.  The main process owns the actual child processes.
 */

// ---------------------------------------------------------------------------
// Types (shared with preload / UI)
// ---------------------------------------------------------------------------

export interface TerminalSession {
  id: string;
  /** Human-readable name, e.g. "Build", "Robot Monitor" */
  name: string;
  /** OS PID of the active child process (if running) */
  pid?: number;
  isActive: boolean;
  /** Rolling last 200 lines of combined stdout+stderr */
  outputBuffer: string[];
  status: 'idle' | 'running' | 'error' | 'done';
  createdAt: number;
  lastUsed: number;
  /** Tailwind colour token for the tab indicator dot */
  color: string;
}

// ---------------------------------------------------------------------------
// Pre-defined session names (created on first use)
// ---------------------------------------------------------------------------

export const PRESET_SESSIONS: Array<{ name: string; color: string }> = [
  { name: 'general', color: 'text-white/60' },
  { name: 'build',   color: 'text-yellow-400' },
  { name: 'robot',   color: 'text-cyan-400' },
  { name: 'python',  color: 'text-green-400' },
  { name: 'test',    color: 'text-purple-400' },
];

const MAX_OUTPUT_LINES = 200;

// ---------------------------------------------------------------------------
// TerminalSessionManager
// ---------------------------------------------------------------------------

export class TerminalSessionManager {
  private sessions: Map<string, TerminalSession> = new Map();
  private outputCallbacks: Map<string, Array<(line: string) => void>> = new Map();
  private sessionUpdateCallbacks: Array<(session: TerminalSession) => void> = [];

  constructor() {
    this._wireIpcEvents();
  }

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create a new session.  If a session with this name already exists, returns
   * the existing one (idempotent by name).
   */
  async createSession(name: string, color?: string): Promise<TerminalSession> {
    const existing = this._findByName(name);
    if (existing) return existing;

    const id = await this._ipc()?.createSession(name) ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session: TerminalSession = {
      id,
      name,
      isActive: true,
      outputBuffer: [],
      status: 'idle',
      createdAt: Date.now(),
      lastUsed: Date.now(),
      color: color ?? 'text-white/60',
    };
    this.sessions.set(id, session);
    this._notifySessionUpdate(session);
    return session;
  }

  getSession(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): TerminalSession[] {
    return [...this.sessions.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Get a session by name, creating it if it doesn't exist.
   */
  async getOrCreateSession(name: string): Promise<TerminalSession> {
    const existing = this._findByName(name);
    if (existing) return existing;
    const preset = PRESET_SESSIONS.find((p) => p.name === name);
    return this.createSession(name, preset?.color);
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Execute `command` inside the named session.
   * `onOutput` is called for each line of stdout/stderr in real-time.
   * Resolves with the process exit code.
   */
  async executeInSession(
    sessionId: string,
    command: string,
    onOutput?: (line: string) => void
  ): Promise<number> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    session.status = 'running';
    session.lastUsed = Date.now();
    this._notifySessionUpdate(session);

    if (onOutput) {
      const cbs = this.outputCallbacks.get(sessionId) ?? [];
      cbs.push(onOutput);
      this.outputCallbacks.set(sessionId, cbs);
    }

    try {
      const ipc = this._ipc();
      if (ipc) {
        await ipc.executeInSession(sessionId, command);
        // Exit code comes via IPC events; resolve 0 optimistically
        return 0;
      }
      // Fallback for non-Electron (web / test) environments
      this._appendOutput(session, `$ ${command}`);
      this._appendOutput(session, `(demo) Command would run: ${command}`);
      session.status = 'done';
      this._notifySessionUpdate(session);
      return 0;
    } catch (err) {
      session.status = 'error';
      this._notifySessionUpdate(session);
      throw err;
    }
  }

  async killSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    await this._ipc()?.killSession(id);
    session.status = 'idle';
    session.pid = undefined;
    this._notifySessionUpdate(session);
  }

  clearSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.outputBuffer = [];
    this._notifySessionUpdate(session);
  }

  // -------------------------------------------------------------------------
  // Event subscriptions
  // -------------------------------------------------------------------------

  /**
   * Subscribe to line-by-line output for a specific session.
   * Returns an unsubscribe function.
   */
  onOutput(sessionId: string, callback: (line: string) => void): () => void {
    const cbs = this.outputCallbacks.get(sessionId) ?? [];
    cbs.push(callback);
    this.outputCallbacks.set(sessionId, cbs);
    return () => {
      const updated = (this.outputCallbacks.get(sessionId) ?? []).filter((c) => c !== callback);
      this.outputCallbacks.set(sessionId, updated);
    };
  }

  /**
   * Subscribe to session metadata updates (status, pid, etc.).
   */
  onSessionUpdate(callback: (session: TerminalSession) => void): () => void {
    this.sessionUpdateCallbacks.push(callback);
    return () => {
      this.sessionUpdateCallbacks = this.sessionUpdateCallbacks.filter((c) => c !== callback);
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _findByName(name: string): TerminalSession | undefined {
    return [...this.sessions.values()].find((s) => s.name === name);
  }

  private _appendOutput(session: TerminalSession, line: string): void {
    session.outputBuffer.push(line);
    if (session.outputBuffer.length > MAX_OUTPUT_LINES) {
      session.outputBuffer.shift();
    }
    // Notify per-session listeners
    const cbs = this.outputCallbacks.get(session.id) ?? [];
    for (const cb of cbs) cb(line);
  }

  private _notifySessionUpdate(session: TerminalSession): void {
    for (const cb of this.sessionUpdateCallbacks) cb(session);
  }

  private _ipc() {
    if (typeof window !== 'undefined' && (window as any).pip?.terminal) {
      return (window as any).pip.terminal as {
        createSession(name: string): Promise<string>;
        listSessions(): Promise<TerminalSession[]>;
        executeInSession(sessionId: string, command: string): Promise<void>;
        killSession(sessionId: string): Promise<void>;
      };
    }
    return null;
  }

  /**
   * Wire up IPC event listeners from the preload bridge so that output and
   * session updates are pushed into the local session state.
   */
  private _wireIpcEvents(): void {
    if (typeof window === 'undefined') return;
    const pip = (window as any).pip;
    if (!pip?.terminal) return;

    // Per-session output lines
    pip.terminal.onOutput?.((data: { sessionId: string; line: string }) => {
      const session = this.sessions.get(data.sessionId);
      if (session) this._appendOutput(session, data.line);
    });

    // Session status / pid updates pushed from the main process
    pip.terminal.onSessionUpdate?.((updated: TerminalSession) => {
      const session = this.sessions.get(updated.id);
      if (session) {
        Object.assign(session, updated);
        this._notifySessionUpdate(session);
      } else {
        // New session created in main process (e.g. by another renderer)
        this.sessions.set(updated.id, updated);
        this._notifySessionUpdate(updated);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton — import from here throughout the renderer
// ---------------------------------------------------------------------------
export const terminalSessionManager = new TerminalSessionManager();
