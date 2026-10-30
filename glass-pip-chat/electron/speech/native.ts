import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface VoiceOptions { voice?: string; rate?: number; volume?: number; engine?: 'local' | 'google' | 'gemini'; cloudVoice?: string }
let active: ChildProcess | undefined;

export function cancelNativeSpeech(): void { active?.kill(); active = undefined; }

export async function installedVoices(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; try { ConvertTo-Json -Compress -InputObject @($s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }) } finally { $s.Dispose() }'], { windowsHide: true });
    let output = '';
    child.stdout.on('data', data => { output += data.toString(); });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Installed voice lookup timed out.')); }, 10_000);
    child.once('error', () => { clearTimeout(timeout); reject(new Error('Windows voice lookup unavailable.')); });
    child.once('exit', code => {
      clearTimeout(timeout);
      try { if (code !== 0) throw new Error(); resolve(JSON.parse(output) as string[]); }
      catch { reject(new Error('Could not load installed Windows voices.')); }
    });
  });
}

/** Windows' installed SAPI voices, without a cloud account or voice cloning. */
export async function nativeSpeech(text: string, options: VoiceOptions = {}): Promise<string> {
  if (process.platform !== 'win32') throw new Error('Local speech playback currently supports Windows installed voices.');
  if (!text.trim() || text.length > 6000) throw new Error('Speech text must be between 1 and 6000 characters.');
  const directory = await mkdtemp(join(tmpdir(), 'ally-voice-'));
  const output = join(directory, 'reply.wav');
  const script = `[Console]::InputEncoding = New-Object System.Text.UTF8Encoding; Add-Type -AssemblyName System.Speech; $data = [Console]::In.ReadToEnd() | ConvertFrom-Json; $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { if ($data.voice) { $speaker.SelectVoice($data.voice) }; $speaker.Rate = [int]$data.rate; $speaker.Volume = [int]$data.volume; $speaker.SetOutputToWaveFile($data.output); $speaker.Speak([string]$data.text) } finally { $speaker.Dispose() }`;
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
      active = child;
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Local voice generation timed out.')); }, 90_000);
      child.once('error', () => { clearTimeout(timeout); reject(new Error('Windows speech synthesis could not start.')); });
      child.once('exit', code => {
        clearTimeout(timeout);
        if (active === child) active = undefined;
        if (code === 0) resolve(); else reject(new Error('Speech cancelled or the installed voice is unavailable.'));
      });
      child.stdin.end(JSON.stringify({ text, output, voice: options.voice ?? '', rate: Math.max(-10, Math.min(10, Math.round(options.rate ?? 0))), volume: Math.max(0, Math.min(100, Math.round((options.volume ?? 1) * 100))) }));
    });
    return (await readFile(output)).toString('base64');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
