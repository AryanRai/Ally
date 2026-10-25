$ErrorActionPreference='Stop'
& powershell.exe -NoProfile -File (Join-Path $PSScriptRoot 'apply-ally-display.ps1') -Install
if($LASTEXITCODE -ne 0){throw 'The display update failed.'}
& powershell.exe -NoProfile -File (Join-Path $PSScriptRoot 'apply-ally-notch.ps1') -Install
if($LASTEXITCODE -ne 0){throw 'The embedded chat update failed.'}
& powershell.exe -NoProfile -File (Join-Path $PSScriptRoot 'apply-ally-surface.ps1') -Install
if($LASTEXITCODE -ne 0){throw 'The unified surface update failed.'}
& powershell.exe -NoProfile -File (Join-Path $PSScriptRoot 'apply-ally-settings.ps1') -Install
if($LASTEXITCODE -ne 0){throw 'The Settings usage update failed.'}
& (Join-Path $PSScriptRoot 'start-ally-backend.ps1')
$taskHealth=Invoke-RestMethod 'http://127.0.0.1:18783/health' -TimeoutSec 3
if(!$taskHealth.speech){throw 'Own-backend connector is not ready.'}
$env:HEYCLICKY_WORKER_BASE_URL='http://127.0.0.1:18783'
$env:HEYCLICKY_DATA_DIR=Join-Path $PSScriptRoot 'profile'
$env:HEYCLICKY_SENTRY_OFF='1'
$taskRuntime=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.json') -Raw | ConvertFrom-Json
$taskPanel=[Uri]$taskRuntime.panel
$env:ALLY_NOTCH_URL=$taskPanel.GetLeftPart([UriPartial]::Authority)+'/notch/'+$taskPanel.Fragment
$env:ALLY_USAGE_URL=$taskPanel.GetLeftPart([UriPartial]::Authority)+'/usage/'+$taskPanel.Fragment
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $PSScriptRoot 'profile\webview'
Start-Process -FilePath (Join-Path $PSScriptRoot 'client\AllyStudy.exe') -WorkingDirectory (Join-Path $PSScriptRoot 'client') -WindowStyle Hidden
Write-Output 'Started Ally Study using your Codex and Ally speech.'
