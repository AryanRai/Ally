import { interactions } from '../devices/interactions.js';
import { interruptedSessions } from './interrupted.js';
import { configureUnread, discoveryReadStates, unreadState, acknowledgeUnread } from './unread.js';
import { startNativeUnread, acknowledgeNativeUnread, reconcileNativeUnread } from './codexUnread.js';
import { startUnreadTracking } from './unreadTracking.js';
import { messageQueue, type QueueChange } from './messageQueue.js';
// IPC surface for the agent backends (see preload `pip.agent`).
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { resolveAgentBinary } from './binaries.js';
import { startAgentRun, steerAgentRun, stopAgentRun, stopAllAgentRuns, canStopAgentSession, stopAgentSession } from './runner.js';
import { listRunningSessions } from './runningSessions.js';
import { listAgentModels, listAgentSessions, loadAgentSession } from './sessions.js';
import { readAgentMonitor } from './agentMonitor.js';
import { watchAgentSessions } from './sessionWatch.js';
import { configureCodexMigrations } from './codexMigration.js';
import { configureCodexHistory, listCodexChats, listCodexChatsPage, loadCodexChat, closeCodexHistory } from './codexHistory.js';
import { chatSelection, type SharedChatSelection } from './selection.js';
import { generateGreeting } from './greeting.js';
import { registerCodexAccountIpc } from './codexAccountIpc.js';
import { registerClaudeLoginIpc } from './claudeLogin.js';
import { desktopInteraction } from './desktopApprovals.js';
import { startNativeDesktopApprovals } from './nativeDesktopApprovals.js';
import { localImage } from './localImage.js';
import { startWatchBridge } from '../watch/bridge.js';
import { liveStudyReplies } from '../watch/liveStudyReply.js';
import { revealFloatingSurface } from '../surface/coordinator.js';
import type { AgentConfig, AgentProvider, AgentRunOptions } from './types.js';

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'agent-config.json');

function loadConfig(): AgentConfig {
  const defaults: AgentConfig = {
    defaultCwd: app.getPath('home'),
    permission: 'edit',
    robotMcpUrl: 'http://localhost:8090/mcp',
    droidcoreMcpUrl: 'http://localhost:8091/mcp',
    shakeToCircle: true,
  };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8')) };
  } catch {
    return defaults;
  }
}

/** Registers `agent:*` IPC; `onConfig` sees the config at startup and after every change. */
export function registerAgentIpc(getWindow: () => BrowserWindow | null, onConfig?: (config: AgentConfig) => void): void {
  let config = loadConfig();
  registerCodexAccountIpc(getWindow, () => config.codexPath);
  interactions.configure(path.join(app.getPath('userData'), 'chat-interactions.json'));
  const stopInteractionEvents = interactions.subscribe((event) => {
    const win = getWindow(); if (!win || win.isDestroyed()) return;
    win.webContents.send('agent:interactionsChanged');
    if (event.type === 'interaction') {
      revealFloatingSurface();
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.flashFrame(true);
    }
  });
  app.on('will-quit', stopInteractionEvents);
  interruptedSessions.configure(path.join(app.getPath('userData'), 'interrupted-sessions.json'));
  configureUnread(path.join(app.getPath('userData'), 'chat-read-state.json'));
  messageQueue.configure(path.join(app.getPath('userData'), 'message-queue.json'));
  const stopNativeUnread = startNativeUnread();
  const stopNativeApprovals = startNativeDesktopApprovals(() => !!config.codexDesktop);
  const stopUnreadTracking = startUnreadTracking();
  app.on('will-quit', () => { stopNativeApprovals(); stopNativeUnread(); stopUnreadTracking(); });
  configureCodexMigrations(path.join(app.getPath('userData'), 'codex-migrations.json'));
  configureCodexHistory(config.codexPath);
  onConfig?.(config);
  void app.whenReady().then(() => {
    const stopBridge = startWatchBridge(() => config);
    if (stopBridge) app.on('will-quit', stopBridge);
  });
  const binPath = (provider: AgentProvider) => (provider === 'claude' ? config.claudePath : config.codexPath);
  registerClaudeLoginIpc(getWindow, () => config.claudePath);

  ipcMain.handle('agent:getConfig', () => ({ ...config, homeCwd: app.getPath('home') }));

  ipcMain.handle('agent:updateConfig', (_, patch: Partial<AgentConfig>) => {
    config = { ...config, ...patch };
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify(config, null, 2));
    onConfig?.(config);
    configureCodexHistory(config.codexPath);
    return { ...config, homeCwd: app.getPath('home') };
  });

  ipcMain.handle('agent:status', async () => {
    const [claude, codex] = await Promise.all([
      resolveAgentBinary('claude', config.claudePath),
      resolveAgentBinary('codex', config.codexPath),
    ]);
    return { claude: { available: !!claude, path: claude }, codex: { available: !!codex, path: codex } };
  });

  ipcMain.handle('agent:listModels', (_, provider: AgentProvider) => listAgentModels(provider));
  ipcMain.handle('agent:greeting', (_, provider: AgentProvider, model?: string) => generateGreeting(provider, model, binPath(provider)));

  ipcMain.handle('agent:send', async (event, opts: Omit<AgentRunOptions, 'cwd'> & { cwd?: string; robot?: { instructions: string } }) => {
    const sender = event.sender;
    let sessionId = opts.sessionId;
    return startAgentRun(
      {
        ...opts,
        cwd: opts.cwd || config.defaultCwd,
        permission: opts.permission ?? config.permission,
        codexDesktop: config.codexDesktop === true,
        robot: opts.robot && {
          instructions: opts.robot.instructions,
          mcpUrl: config.robotMcpUrl,
          motionMcpUrl: config.droidcoreMcpUrl,
        },
      },
      (runId, ev) => { if (ev.kind === 'session') sessionId = ev.sessionId; if (!sender.isDestroyed()) sender.send('agent:event', { runId, event: ev }); },
      binPath(opts.provider),
      opts.provider === 'codex' ? desktopInteraction(() => sessionId ? `${opts.provider}:${sessionId}` : undefined) : undefined,
      'desktop',
    );
  });

  const fromMain = (event: Electron.IpcMainInvokeEvent) => {
    const win = getWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw Error('Decisions must come from Ally chat.');
  };
  const stopSelection = chatSelection.subscribe(state => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('agent:selection', state);
  });
  app.on('will-quit', stopSelection);
  ipcMain.handle('agent:getSelection', event => { fromMain(event); return chatSelection.snapshot(); });
  ipcMain.handle('agent:setSelection', (event, selected: SharedChatSelection | null, version: string) => {
    fromMain(event); return chatSelection.set(selected, version, 'desktop');
  });
  ipcMain.handle('agent:localImage', (event, source: string) => { fromMain(event); return localImage(source); });
  ipcMain.handle('agent:interactionHistory', (event, chatId: string) => {
    fromMain(event);
    if (typeof chatId !== 'string' || !/^(codex|claude):[\w-]{8,100}$/.test(chatId)) throw Error('Select the original chat');
    return interactions.history(chatId);
  });
  ipcMain.handle('agent:pendingInteractions', event => { fromMain(event);return interactions.list(); });
  ipcMain.handle('agent:answerInteraction', (event, chatId: string, id: string, answer: import('../watch/approvals').ApprovalAnswer) => {
    fromMain(event);
    const request = interactions.list(chatId).find(request => request.id === id);
    if (!request) throw Error('This request was already answered, cancelled or expired.');
    interactions.answer(id, answer, 'desktop'); return { accepted: true };
  });

  ipcMain.handle('agent:sessionInput', async (_, provider: AgentProvider, sessionId: string, text: string, requestId: string, mode: 'steer' | 'queue') => {
    if (!['codex', 'claude'].includes(provider) || typeof sessionId !== 'string' || !sessionId || sessionId.length > 200 || typeof text !== 'string' || !text.trim() || text.length > 12000 || !/^[\w-]{1,80}$/.test(requestId) || !['steer', 'queue'].includes(mode)) throw new Error('Invalid session input');
    const bridge = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'watch-bridge.json'), 'utf8'));
    if (!bridge.enabled) throw new Error('Enable the phone/watch connection in Ally settings to send input to an external chat. Your draft is kept.');
    const chatId = `${provider}:${sessionId}`;
    const route = mode === 'steer' ? `/v1/chats/${encodeURIComponent(chatId)}/input` : '/v1/messages';
    const body = mode === 'steer' ? { text, requestId, mode } : { provider, chatId, text, requestId, queueAfterCurrent: true, permission: config.permission };
    const response = await fetch(`http://127.0.0.1:${bridge.port}${route}`, { method: 'POST', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || 'Input was not confirmed. Your draft is kept.');
    return mode === 'steer' ? 'steered' : 'queued';
  });
  ipcMain.handle('agent:queue', (_, key: string) => messageQueue.snapshot(key));
  ipcMain.handle('agent:queueChange', (_, key: string, change: QueueChange) => messageQueue.change(key, change));
  ipcMain.handle('agent:steer', (_, runId: string, text: string, requestId: string, mode?: 'auto' | 'steer' | 'queue') => steerAgentRun(runId, text, requestId, mode));

  ipcMain.handle('agent:stopSession', (_, provider: AgentProvider, id: string) => {
    if (!['codex', 'claude'].includes(provider) || typeof id !== 'string' || !id || id.length > 240) throw Error('Invalid chat');
    return stopAgentSession(`${provider}:${id}`);
  });

  ipcMain.handle('agent:stop', (_, runId: string) => stopAgentRun(runId));

  ipcMain.handle('agent:activity', event => { fromMain(event); return readAgentMonitor(); });
  ipcMain.handle('agent:runningSessions', () => listRunningSessions());
  ipcMain.handle('agent:listSessions', (_, provider: AgentProvider, limit?: number) => provider === 'codex' ? listCodexChats(limit) : listAgentSessions(provider, limit));
  ipcMain.handle('agent:listSessionsPage', async (event, provider: AgentProvider, cursor?: string) => {
    fromMain(event);
    if (!['codex', 'claude'].includes(provider) || (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 16000))) throw Error('Invalid chat page');
    if (provider === 'codex') return listCodexChatsPage(30, cursor);
    const offset = cursor === undefined ? 0 : Number(cursor);
    if (!Number.isSafeInteger(offset) || offset < 0) throw Error('Invalid chat page');
    const rows = await listAgentSessions(provider, offset + 31);
    return { sessions: rows.slice(offset, offset + 30), nextCursor: rows.length > offset + 30 ? String(offset + 30) : undefined };
  });

  ipcMain.handle('agent:readStates', (_, keys?: string[]) => discoveryReadStates(Array.isArray(keys) ? keys.filter(key => typeof key === 'string' && /^(codex|claude):[\w-]+$/.test(key)) : []));
  ipcMain.handle('agent:markRead', async (_, provider: AgentProvider, id: string, revision: string) => {
    if (!['codex', 'claude'].includes(provider) || typeof id !== 'string' || typeof revision !== 'string') throw new Error('Invalid read receipt');
    if (provider === 'codex') await reconcileNativeUnread(id);
    const accepted = acknowledgeUnread(provider, id, revision);
    if (accepted && provider === 'codex') acknowledgeNativeUnread(id);
    return accepted;
  });
  ipcMain.handle('agent:liveStudyReply', (event, key: string) => event.sender === getWindow()?.webContents && typeof key === 'string' ? liveStudyReplies.read(key) : null);
  const stopLiveStudy = liveStudyReplies.subscribe(reply => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('agent:liveStudyReply', reply);
  });
  app.once('will-quit', () => { stopLiveStudy(); liveStudyReplies.close(); });
  ipcMain.handle('agent:loadSession', async (_, provider: AgentProvider, id: string, revision?: string) => {
    const readState = unreadState(provider, id); // Captured before loading: never acknowledge a later unseen reply.
    const snapshot = provider === 'codex' ? await loadCodexChat(id, revision) : await loadAgentSession(provider, id, revision);
    const key = `${provider}:${snapshot.sessionId ?? id}`;
    const canStop = canStopAgentSession(key);
    interruptedSessions.observe(key, Math.max(0, ...snapshot.messages.filter(m => m.role === 'user').map(m => m.timestamp)));
    return { ...snapshot, canStop, interrupted: !snapshot.running && !canStop ? interruptedSessions.read(key) : undefined, readState: { ...readState, key: `${provider}:${snapshot.sessionId ?? id}` } };
  });
  const stopWatching = watchAgentSessions(provider => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('agent:sessionsChanged', provider);
  });
  app.on('will-quit', stopWatching);

  ipcMain.handle('agent:pickFolder', async (_, current?: string) => {
    const win = getWindow();
    const options = {
      title: 'Choose the agent working folder',
      defaultPath: current || config.defaultCwd,
      properties: ['openDirectory' as const],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0];
  });

  app.on('will-quit', stopAllAgentRuns);
  app.on('will-quit', closeCodexHistory);
}
