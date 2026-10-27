# Run manually from PowerShell. Restarts this project's Ally only; never Codex.
[CmdletBinding()]
param([switch]$Yes)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
Write-Host 'This builds and restarts Ally desktop and Study when they are idle.'
Write-Host 'Run after the implementation chats finish. Android installation is handled separately.'
if (!$Yes) {
 $taskAnswer = Read-Host 'Type yes to continue'
 if ($taskAnswer.Trim() -ine 'yes') { Write-Host 'Cancelled. Nothing changed.'; return }
}
Set-Location -LiteralPath $taskRoot
$taskPwsh = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
if (!(Test-Path -LiteralPath $taskPwsh)) { throw 'The configured PowerShell runtime is missing.' }
$taskLogs = Join-Path $taskRoot '.local/manual-restart'
New-Item -ItemType Directory -Force -Path $taskLogs | Out-Null
$taskExe = Join-Path $taskRoot 'glass-pip-chat/node_modules/electron/dist/electron.exe'
$taskNativeExe = Join-Path $taskRoot 'ally-study/client/AllyStudy.exe'
$taskBridge = Get-Content -LiteralPath (Join-Path $env:APPDATA 'glass-pip-chat/watch-bridge.json') -Raw | ConvertFrom-Json
function Get-AllyMain {
 @(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object {
  $_.ExecutablePath -eq $taskExe -and $_.CommandLine -notmatch '--type='
 })
}
function Assert-StudyIdle {
 if (Get-NetTCPConnection -LocalPort 18783 -State Listen -ErrorAction SilentlyContinue) {
  if ((Invoke-RestMethod http://127.0.0.1:18783/health -TimeoutSec 3).active -ne 0) {
   throw 'Ally Study is working. Let that reply finish, then run this script again.'
  }
 }
}
function Invoke-AllyCheck([string]$Script) {
 $taskRaw = & node.exe .local/debug-eval.cjs $Script
 if ($LASTEXITCODE -ne 0) { throw "Ally verification failed: $Script" }
 $taskResult = $taskRaw | ConvertFrom-Json
 if ($taskResult.exceptionDetails) { throw "Ally refused the restart check: $Script. Finish active work or close its drawing window first." }
 return $taskResult.result.value
}

Write-Host 'Checking the latest Ally build…'
$taskHash = & (Join-Path $taskRoot 'tools/get-ally-source-hash.ps1') -Root $taskRoot
$taskManifest = $null
foreach ($taskBuildDirectory in (Get-ChildItem -LiteralPath (Join-Path $taskRoot '.local/builds') -Directory | Sort-Object LastWriteTime -Descending)) {
 $taskCandidate = Join-Path $taskBuildDirectory.FullName 'build-manifest.json'
 if (!(Test-Path -LiteralPath $taskCandidate)) { continue }
 try { $taskExisting = Get-Content -LiteralPath $taskCandidate -Raw | ConvertFrom-Json } catch { continue }
 if ($taskExisting.sourceHash -eq $taskHash) { $taskManifest = $taskExisting; break }
}
if (!$taskManifest -or $taskManifest.sourceHash -ne $taskHash) {
 Write-Host 'Sources changed; building a fresh candidate before closing anything…'
 $taskBuildOutput = & $taskPwsh -NoProfile -File (Join-Path $taskRoot 'build-ally.ps1') -StageOnly 2>&1
 $taskBuildOutput | Set-Content -LiteralPath (Join-Path $taskLogs 'build.log')
 if ($LASTEXITCODE -ne 0) { throw "Build failed. Ally was left running. See $taskLogs\build.log" }
 $taskMatch = [regex]::Match(($taskBuildOutput -join "`n"), 'Staged unified Ally at (.+?)\. Native files')
 if (!$taskMatch.Success) { throw 'The build did not return a verified candidate.' }
 $taskCandidate = Join-Path $taskMatch.Groups[1].Value 'build-manifest.json'
 $taskManifest = Get-Content -LiteralPath $taskCandidate -Raw | ConvertFrom-Json
}
$taskDesktop = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskManifest.desktop))
$taskBuildRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot '.local/builds')).TrimEnd('\') + '\'
if (!$taskDesktop.StartsWith($taskBuildRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected candidate location.' }
if ((& (Join-Path $taskRoot 'tools/get-ally-source-hash.ps1') -Root $taskRoot) -ne $taskManifest.sourceHash) { throw 'Sources changed during preparation. Run again after the edits finish.' }
Assert-StudyIdle
$taskMain = @(Get-AllyMain)
if ($taskMain.Count -gt 1) { throw 'Multiple Ally desktop processes found. Nothing was closed.' }
if (!$taskMain.Count -and (Get-NetTCPConnection -LocalPort $taskBridge.port -State Listen -ErrorAction SilentlyContinue)) { throw 'An unidentified runtime owns the Ally connection. Nothing was closed.' }
$taskInspector = $false
try {
 if ($taskMain.Count) {
  & node.exe -e "process._debugProcess($($taskMain[0].ProcessId))"
  if ($LASTEXITCODE -ne 0) { throw 'Unable to check Ally saved state.' }
  $taskInspector = $true
  $taskBefore = Invoke-AllyCheck '.local/native-study-validation/pre-restart.js'
  if (!$taskBefore.durable -or $taskBefore.pid -ne $taskMain[0].ProcessId) { throw 'The draft is not saved yet. Nothing was closed.' }
 }
 Assert-StudyIdle
 $taskConnector = $null
 if (Get-NetTCPConnection -LocalPort 18783 -State Listen -ErrorAction SilentlyContinue) {
  $taskRuntime = Get-Content -LiteralPath 'ally-study/runtime.json' -Raw | ConvertFrom-Json
  $taskConnector = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskRuntime.pid)"
  $taskOwners = @(Get-NetTCPConnection -LocalPort 18783 -State Listen)
  if (!$taskConnector -or $taskConnector.Name -ne 'node.exe' -or !$taskConnector.CommandLine.Contains((Join-Path $taskRoot 'ally-study\ally-server.mjs')) -or $taskOwners.OwningProcess -notcontains [int]$taskRuntime.pid) {
   throw 'Ally connector identity could not be verified. Nothing was closed.'
  }
 }
 $taskNative = @(Get-CimInstance Win32_Process -Filter "Name='AllyStudy.exe'" | Where-Object { $_.ExecutablePath -eq $taskNativeExe })
 if ($taskNative.Count -gt 1) { throw 'Multiple Ally Study windows found. Nothing was closed.' }
 Copy-Item -LiteralPath '.local/unified-build.json' -Destination (Join-Path $taskLogs 'previous-build.json') -Force
 if (Test-Path -LiteralPath 'ally-study/profile/ally-selected-chat.json') {
  Copy-Item -LiteralPath 'ally-study/profile/ally-selected-chat.json' -Destination (Join-Path $taskLogs 'selected-chat.json') -Force
 }
 Write-Host 'Restarting Ally…'
 if ($taskMain.Count) {
  $taskQuit = Invoke-AllyCheck '.local/native-study-validation/quit-desktop.js'
  if (!$taskQuit.quitRequested) { throw 'Ally did not accept a normal quit.' }
  $taskOldProcess = Get-Process -Id $taskMain[0].ProcessId -ErrorAction SilentlyContinue
  if ($taskOldProcess -and !$taskOldProcess.WaitForExit(10000)) { throw 'Ally is still closing. No forced desktop termination was attempted.' }
  $taskInspector = $false
 }
 if ($taskNative.Count) {
  $taskNativeProcess = Get-Process -Id $taskNative[0].ProcessId
  [void]$taskNativeProcess.CloseMainWindow()
  if (!$taskNativeProcess.WaitForExit(3000)) { Stop-Process -Id $taskNative[0].ProcessId }
 }
 if ($taskConnector) { Stop-Process -Id $taskConnector.ProcessId }
 for ($taskTry = 0; $taskTry -lt 30; $taskTry++) {
  if (!(Get-NetTCPConnection -LocalPort 18783 -State Listen -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 200
 }
 $taskManifest | ConvertTo-Json | Set-Content -LiteralPath '.local/unified-build.json.staged'
 Move-Item -LiteralPath '.local/unified-build.json.staged' -Destination '.local/unified-build.json' -Force
 $env:PATH = 'C:\ProgramData\anaconda3;' + $env:PATH
 $env:ALLY_SCRCPY_PATH = Join-Path $taskRoot '.local/tools/scrcpy-v5.0.1/scrcpy-win64-v5.0.1/scrcpy.exe'
 $taskLauncher = Start-Process -FilePath $taskPwsh -ArgumentList @('-NoProfile', '-File', ('"' + (Join-Path $taskRoot 'start-ally.ps1') + '"')) -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'start.log') -RedirectStandardError (Join-Path $taskLogs 'start.err.log') -PassThru
 $taskReady = $false
 for ($taskTry = 0; $taskTry -lt 60; $taskTry++) {
  Start-Sleep -Seconds 1
  try {
   $taskSelection = Invoke-RestMethod -Uri "http://127.0.0.1:$($taskBridge.port)/v1/selection" -Headers @{Authorization='Bearer '+$taskBridge.token} -TimeoutSec 1
   $taskHealth = Invoke-RestMethod http://127.0.0.1:18783/health -TimeoutSec 1
   $taskNativeReady = @(Get-CimInstance Win32_Process -Filter "Name='AllyStudy.exe'" | Where-Object { $_.ExecutablePath -eq $taskNativeExe })
   if ($taskSelection.version -and $taskHealth.speech -and (Get-AllyMain).Count -eq 1 -and $taskNativeReady.Count -eq 1) { $taskReady = $true; break }
  } catch { }
 }
 if (!$taskReady) { throw "Startup is not confirmed. Check $taskLogs\start.log and start.err.log." }
 Write-Host 'Ally desktop and Study are running with the latest staged changes.' -ForegroundColor Green
} finally {
 if ($taskInspector) { try { & node.exe .local/debug-eval.cjs .local/identity-build/close-inspector.js | Out-Null } catch { } }
}
