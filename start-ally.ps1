$ErrorActionPreference='Stop'
$taskManifestPath=Join-Path $PSScriptRoot '.local\unified-build.json'
if(!(Test-Path -LiteralPath $taskManifestPath)){throw 'Run build-ally.ps1 first to prepare the unified desktop and native UI.'}
$taskManifest=Get-Content -LiteralPath $taskManifestPath -Raw | ConvertFrom-Json
if((& (Join-Path $PSScriptRoot 'tools\get-ally-source-hash.ps1') -Root $PSScriptRoot) -ne $taskManifest.sourceHash){throw 'Ally source changed since this candidate was built. Run build-ally.ps1 to avoid loading an older interface.'}
$taskDesktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot $taskManifest.desktop))
$taskBuildRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.local\builds')).TrimEnd('\')+'\'
if(!$taskDesktop.StartsWith($taskBuildRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid local desktop candidate.'}
$taskBridgeFile=Join-Path $env:APPDATA 'glass-pip-chat\watch-bridge.json'
$taskBridge=Get-Content -LiteralPath $taskBridgeFile -Raw | ConvertFrom-Json
if(!$taskBridge.enabled -or !$taskBridge.token){throw 'Enable the local chat connection in Ally settings before starting the unified interface.'}
foreach($taskPort in @([int]$taskBridge.port,18783)){
 if(Get-NetTCPConnection -LocalPort $taskPort -State Listen -ErrorAction SilentlyContinue){throw "An existing Ally runtime is using port $taskPort. Close the old runtime normally before starting unified Ally. No process was stopped."}
}
& (Join-Path $PSScriptRoot 'tools\complete-ally-migration.ps1') -Root $PSScriptRoot
$taskExe=Join-Path $PSScriptRoot 'glass-pip-chat\node_modules\electron\dist\electron.exe'
$env:ALLY_STUDY_ROOT=Join-Path $PSScriptRoot 'ally-study'
$taskDesktopProcess=Start-Process -FilePath $taskExe -ArgumentList '.' -WorkingDirectory $taskDesktop -WindowStyle Hidden -PassThru
$taskReady=$false
for($taskAttempt=0;$taskAttempt -lt 80;$taskAttempt++){
 Start-Sleep -Milliseconds 250
 try {
  $taskSelection=Invoke-RestMethod -Uri "http://127.0.0.1:$($taskBridge.port)/v1/selection" -Headers @{Authorization='Bearer '+$taskBridge.token} -TimeoutSec 1
  if($taskSelection.version){$taskReady=$true;break}
 } catch {}
 if($taskDesktopProcess.HasExited){throw 'Ally desktop exited. The native client was not started.'}
}
if(!$taskReady){throw 'Ally desktop did not expose shared chats. The native client was not started.'}
$env:ALLY_DESKTOP_ROOT=$taskDesktop
& (Join-Path $PSScriptRoot 'ally-study\start-ally-study.ps1')
