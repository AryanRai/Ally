$ErrorActionPreference='Stop'
$taskRuntime=Join-Path $PSScriptRoot 'runtime.json'
$taskSourceBytes=New-Object IO.MemoryStream
foreach($taskSourceFile in @('ally-server.mjs','ally-history.mjs','ally-notch.mjs','ally-selection.mjs','ally-native-turn.mjs','ally-stream.mjs','notch-build.json')){
 $taskBytes=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $taskSourceFile))
 $taskSourceBytes.Write($taskBytes,0,$taskBytes.Length)
}
$taskHasher=[Security.Cryptography.SHA256]::Create()
$taskRevision=[BitConverter]::ToString($taskHasher.ComputeHash($taskSourceBytes.ToArray())).Replace('-','').ToLowerInvariant()
$taskHasher.Dispose();$taskSourceBytes.Dispose()
if(Test-Path -LiteralPath $taskRuntime){
 $taskPrevious=Get-Content -LiteralPath $taskRuntime -Raw | ConvertFrom-Json
 $taskHealth=$null
 try { $taskHealth=Invoke-RestMethod "http://127.0.0.1:$($taskPrevious.port)/health" -TimeoutSec 2 } catch{}
 if($taskHealth -and $taskHealth.speech){
  if($taskHealth.sourceRevision -eq $taskRevision){Write-Output 'Ally Study backend already running.';exit 0}
  $taskPrivateExe=Join-Path $PSScriptRoot 'client\AllyStudy.exe'
  if(@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq $taskPrivateExe}).Count){throw 'Close the private Ally Study client before loading the updated backend.'}
  if($null -eq $taskHealth.active -or [int]$taskHealth.active -ne 0){throw 'An active study request prevents the backend update.'}
  $taskOld=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$taskPrevious.pid)"
  $taskServerPath=Join-Path $PSScriptRoot 'ally-server.mjs'
  $taskOwners=@(Get-NetTCPConnection -LocalPort $taskPrevious.port -State Listen -ErrorAction SilentlyContinue)
  if(!$taskOld -or $taskOld.Name -ne 'node.exe' -or !$taskOld.CommandLine.Contains($taskServerPath) -or !($taskOwners.OwningProcess -contains [int]$taskPrevious.pid)){throw 'Existing backend identity did not match; no process stopped.'}
  Stop-Process -Id $taskOld.ProcessId -ErrorAction Stop
  for($taskAttempt=0;$taskAttempt -lt 20;$taskAttempt++){
   if(!(Get-NetTCPConnection -LocalPort $taskPrevious.port -State Listen -ErrorAction SilentlyContinue)){break}
   Start-Sleep -Milliseconds 100
  }
  if(Get-NetTCPConnection -LocalPort $taskPrevious.port -State Listen -ErrorAction SilentlyContinue){throw 'Backend port is still occupied.'}
 }
}
$taskNode=(Get-Command node.exe).Source
$taskPort=if($env:ALLY_STUDY_PORT){[int]$env:ALLY_STUDY_PORT}elseif($env:CLICKY_BYO_PORT){[int]$env:CLICKY_BYO_PORT}else{18783}
if(Get-NetTCPConnection -LocalPort $taskPort -State Listen -ErrorAction SilentlyContinue){throw "An older connector is using port $taskPort. Close it normally before starting this copy; no process stopped."}
$taskStart=Start-Process -FilePath $taskNode -ArgumentList @('"'+(Join-Path $PSScriptRoot 'ally-server.mjs')+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'backend.log') -RedirectStandardError (Join-Path $PSScriptRoot 'backend-error.log') -PassThru
Write-Output "Starting Ally Study connector ($($taskStart.Id))."
$taskPort=if($env:ALLY_STUDY_PORT){[int]$env:ALLY_STUDY_PORT}elseif($env:CLICKY_BYO_PORT){[int]$env:CLICKY_BYO_PORT}else{18783}
for($taskAttempt=0;$taskAttempt -lt 60;$taskAttempt++){
 Start-Sleep -Milliseconds 250
 try{
  $taskHealth=Invoke-RestMethod "http://127.0.0.1:$taskPort/health" -TimeoutSec 2
  if($taskHealth.sourceRevision -eq $taskRevision){Write-Output 'Ally Study backend is ready.';exit 0}
 }catch{}
 if($taskStart.HasExited){throw 'The connector exited during startup; inspect backend-error.log.'}
}
throw 'The updated connector did not become ready.'
