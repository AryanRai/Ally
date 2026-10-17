// IPC surface for the agent backends (see preload `pip.agent`).
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { resolveAgentBinary } from './binaries.js';
import { startAgentRun, stopAgentRun, stopAllAgentRuns } from './runner.js';
import { listAgentModels, listAgentSessions, loadAgentSession } from './sessions.js';
import { watchAgentSessions } from './sessionWatch.js';
import { generateGreeting } from './greeting.js';
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
  onConfig?.(config);
  const binPath = (provider: AgentProvider) => (provider === 'claude' ? config.claudePath : config.codexPath);

  ipcMain.handle('agent:getConfig', () => config);

  ipcMain.handle('agent:updateConfig', (_, patch: Partial<AgentConfig>) => {
    config = { ...config, ...patch };
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify(config, null, 2));
    onConfig?.(config);
    return config;
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
    return startAgentRun(
      {
        ...opts,
        cwd: opts.cwd || config.defaultCwd,
        permission: opts.permission ?? config.permission,
        robot: opts.robot && {
          instructions: opts.robot.instructions,
          mcpUrl: config.robotMcpUrl,
          motionMcpUrl: config.droidcoreMcpUrl,
        },
      },
      (runId, ev) => { if (!sender.isDestroyed()) sender.send('agent:event', { runId, event: ev }); },
      binPath(opts.provider),
    );
  });

  ipcMain.handle('agent:stop', (_, runId: string) => stopAgentRun(runId));

  ipcMain.handle('agent:listSessions', (_, provider: AgentProvider, limit?: number) => listAgentSessions(provider, limit));

  ipcMain.handle('agent:loadSession', (_, provider: AgentProvider, id: string, revision?: string) => loadAgentSession(provider, id, revision));
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
}
