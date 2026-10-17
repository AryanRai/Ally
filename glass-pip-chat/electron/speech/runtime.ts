import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface SpeechRuntimeStatus {
  ready: boolean;
  state: 'offline' | 'starting' | 'loading' | 'ready' | 'error';
  backend?: string;
  model?: string;
  error?: string;
}

const url = 'http://127.0.0.1:18766';
let child: ChildProcess | undefined;
let starting: Promise<{ url: string; token: string }> | undefined;
let lastError: string | undefined;
let shuttingDown = false;

function settings(): { path: string; token: string } {
  const path = join(app.getPath('userData'), 'watch-bridge.json');
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(readFileSync(path, 'utf8')); }
  catch { if (existsSync(path)) throw new Error('Voice configuration could not be read. Repair watch-bridge.json before reconnecting.'); }
  if (typeof config.token !== 'string' || config.token.length < 32) {
    config.token = randomBytes(32).toString('hex');
    config.enabled ??= false;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  return { path, token: config.token as string };
}

export async function getSpeechRuntimeStatus(): Promise<SpeechRuntimeStatus> {
  try {
    const config = settings();
    const response = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(2000) });
    if (!response.ok) return { ready: false, state: 'error', error: `Voice worker authentication or health check failed (${response.status}). Restart the voice worker.` };
    const status = await response.json() as SpeechRuntimeStatus & { service?: string };
    if (status.service !== 'ally-speech' || typeof status.ready !== 'boolean') return { ready: false, state: 'error', error: 'An older or unrelated voice worker is running. Stop it and connect again.' };
    return { ...status, state: status.state ?? (status.ready ? 'ready' : 'loading') };
  } catch {
    return { ready: false, state: lastError ? 'error' : child ? 'starting' : 'offline', error: lastError };
  }
}

/** Starts only the transcription worker. Microphone access is renderer-owned and opt-in. */
export function ensureSpeechRuntime(): Promise<{ url: string; token: string }> {
  if (starting) return starting;
  starting = (async () => {
    await app.whenReady();
    if (shuttingDown) throw new Error('Ally is shutting down.');
    lastError = undefined; // A user retry must recover after dependencies have been installed.
    const config = settings();
    const initial = await getSpeechRuntimeStatus();
    if (shuttingDown) throw new Error('Ally is shutting down.');
    if (initial.ready) return { url, token: config.token };
    if (initial.state === 'error' && !child) throw new Error(initial.error);
    if (!child && initial.state !== 'loading') {
      const root = resolve(app.getAppPath(), '..');
      const script = join(root, 'speech-service', 'transcriber.py');
      const candidates = [process.env.ALLY_SPEECH_PYTHON,
        join(root, 'speech-service', '.venv', 'Scripts', 'python.exe'),
        join(root, 'wear-app', '.venv', 'Scripts', 'python.exe')];
      const python = candidates.find(value => value && existsSync(value));
      if (!python || !existsSync(script)) throw new Error('Local speech runtime is missing. Run speech-service/setup.ps1, then Connect again.');
      lastError = undefined;
      const processHandle = spawn(python, [script, '--config', config.path], {
        windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, HF_HUB_DISABLE_IMPLICIT_TOKEN: '1' },
      });
      child = processHandle;
      processHandle.stderr?.on('data', () => { /* Worker may log library diagnostics; never forward audio/text or secrets. */ });
      processHandle.once('error', () => { lastError = 'Local speech worker could not start. Check the Python runtime.'; });
      processHandle.once('exit', code => {
        if (child === processHandle) child = undefined;
        if (code) lastError = `Local speech worker stopped (exit ${code}). Run speech-service/setup.ps1.`;
      });
    }
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (shuttingDown) throw new Error('Ally is shutting down.');
      const status = await getSpeechRuntimeStatus();
      if (status.ready) return { url, token: config.token };
      if (status.state === 'error') throw new Error(status.error ?? 'Local transcription model could not load.');
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    throw new Error('Speech model is still loading. Wait a moment and try Connect again.');
  })().finally(() => { starting = undefined; });
  return starting;
}

export function stopSpeechRuntime(): void {
  shuttingDown = true;
  const owned = child;
  child = undefined;
  if (!owned || owned.exitCode !== null || owned.signalCode !== null) return;
  // A Windows venv launcher creates a second python.exe. Kill only our owned PID
  // and its descendants, otherwise that model process survives Ally's shutdown.
  if (process.platform === 'win32' && owned.pid) {
    const taskkill = spawn('taskkill.exe', ['/PID', String(owned.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore',
    });
    taskkill.once('error', () => { owned.kill(); });
    taskkill.unref();
  } else owned.kill();
}
