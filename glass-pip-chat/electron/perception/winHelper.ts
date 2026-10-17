// One long-lived PowerShell helper for Windows-only perception bits: the
// foreground window (title + process) and OCR through the built-in
// Windows.Media.Ocr engine. No extra installs; requests are JSON lines.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class AllyFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
$engine = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1' })[0]
  function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
} catch { $engine = $null }
[Console]::Out.WriteLine((@{ ready = $true; ocr = [bool]$engine } | ConvertTo-Json -Compress)); [Console]::Out.Flush()
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $out = $null
  try {
    $req = $line | ConvertFrom-Json
    if ($req.op -eq 'window') {
      $h = [AllyFg]::GetForegroundWindow()
      $sb = New-Object Text.StringBuilder 512
      [void][AllyFg]::GetWindowText($h, $sb, 512)
      $procId = [uint32]0
      [void][AllyFg]::GetWindowThreadProcessId($h, [ref]$procId)
      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
      $out = @{ id = $req.id; title = $sb.ToString(); app = [string]$proc.ProcessName }
    } elseif ($req.op -eq 'ocr') {
      if (-not $engine) { throw 'Windows OCR is not available (install an OCR language in Windows settings).' }
      $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($req.path)) ([Windows.Storage.StorageFile])
      $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
      try {
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $out = @{ id = $req.id; text = (($result.Lines | ForEach-Object { $_.Text }) -join "` + '`' + String.raw`n") }
      } finally { $stream.Dispose() }
    }
  } catch { $out = @{ id = $req.id; error = $_.Exception.Message } }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress)); [Console]::Out.Flush()
}
`;

export interface ForegroundWindow { title: string; app: string }

/** Longest side we hand to Windows OCR (OcrEngine.MaxImageDimension is 10000 on this build). */
export const OCR_MAX_DIMENSION = 4000;

export class WinHelper {
  private child: ChildProcess | null = null;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private nextId = 0;
  private ready: Promise<{ ocr: boolean }> | null = null;

  static supported(): boolean {
    return process.platform === 'win32';
  }

  /** Starts the helper (once) and reports whether OCR is usable. */
  start(): Promise<{ ocr: boolean }> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const file = path.join(os.tmpdir(), 'ally-perception-helper.ps1');
      fs.writeFileSync(file, '\uFEFF' + SCRIPT, 'utf8');
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
      this.child = child;
      const lines = readline.createInterface({ input: child.stdout! });
      let started = false;
      lines.on('line', line => {
        let msg: any;
        try { msg = JSON.parse(line.replace(/^\uFEFF/, '')); } catch { return; }
        if (!started && msg.ready) { started = true; resolve({ ocr: !!msg.ocr }); return; }
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg);
      });
      child.on('error', err => { if (!started) reject(err); });
      child.on('close', () => {
        this.child = null;
        this.ready = null;
        if (!started) reject(new Error('Perception helper exited during startup'));
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Perception helper stopped')); }
        this.pending.clear();
      });
    });
    return this.ready;
  }

  private async request(op: string, params: Record<string, unknown>, timeoutMs: number): Promise<any> {
    await this.start();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${op} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child?.stdin?.write(JSON.stringify({ id, op, ...params }) + '\n');
    });
  }

  foreground(): Promise<ForegroundWindow> {
    return this.request('window', {}, 3000).then(r => ({ title: r.title ?? '', app: r.app ?? '' }));
  }

  ocr(imagePath: string): Promise<string> {
    return this.request('ocr', { path: imagePath }, 20_000).then(r => String(r.text ?? ''));
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
    this.ready = null;
  }
}
