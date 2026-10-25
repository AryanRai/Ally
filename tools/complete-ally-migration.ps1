param([string]$Root=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$taskReceiptPath=Join-Path $Root 'ally-study\migration.json'
if(!(Test-Path -LiteralPath $taskReceiptPath)){return}
$taskReceipt=Get-Content -LiteralPath $taskReceiptPath -Raw | ConvertFrom-Json
if($taskReceipt.profileFinalizedAt -or !$taskReceipt.previousPrototypeRoot){return}
$taskPrevious=[IO.Path]::GetFullPath($taskReceipt.previousPrototypeRoot).TrimEnd('\')
$taskSource=Join-Path $taskPrevious 'ally-study\profile'
$taskDestination=[IO.Path]::GetFullPath((Join-Path $Root 'ally-study\profile')).TrimEnd('\')
if(!(Test-Path -LiteralPath $taskSource)){return}
if([IO.Path]::GetFullPath($taskSource).TrimEnd('\') -eq $taskDestination){throw 'Migration profiles must be different directories.'}
if(@(Get-CimInstance Win32_Process | Where-Object {
 ($_.Name -eq 'AllyStudy.exe' -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($taskPrevious+'\',[StringComparison]::OrdinalIgnoreCase)) -or
 ($_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains((Join-Path $taskPrevious 'ally-study\ally-server.mjs')))
}).Count){throw 'Close the former Study runtime normally before finalizing its profile migration.'}
$taskBackup=Join-Path $Root ('.local\migration-backups\'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fffffff'))
New-Item -ItemType Directory -Path $taskBackup,$taskDestination -Force | Out-Null
# The WebView browser cache is regenerated; app identity, settings, history and
# context are copied only after the previous native client/connector have closed.
Get-ChildItem -LiteralPath $taskDestination -Force | Where-Object Name -ne 'webview' | Copy-Item -Destination $taskBackup -Recurse
Get-ChildItem -LiteralPath $taskSource -Force | Where-Object Name -ne 'webview' | Copy-Item -Destination $taskDestination -Recurse -Force
$taskReceipt | Add-Member -NotePropertyName profileFinalizedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$taskReceipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath ($taskReceiptPath+'.staged')
Move-Item -LiteralPath ($taskReceiptPath+'.staged') -Destination $taskReceiptPath -Force
Write-Output 'Finalized Study profile in Ally; a private pre-migration backup is retained.'
