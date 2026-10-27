param([switch]$Install)
$ErrorActionPreference='Stop'
$taskDirectory=Join-Path $PSScriptRoot 'client\ClickyBrowserHost'
$taskHost=Join-Path $taskDirectory 'ClickyBrowserHost.exe'
$taskWorker=Join-Path $taskDirectory 'ClickyBrowserHost.worker.exe'
$taskSource=Join-Path $PSScriptRoot 'native\AllyBrowserHost.cs'
$taskBuild=Join-Path (Split-Path $PSScriptRoot -Parent) '.local\browser-host-build'
$taskStaged=Join-Path $taskBuild 'ClickyBrowserHost.exe'
$taskRecord=Join-Path $taskDirectory 'ally-host-install.json'
$taskSourceHash=(Get-FileHash -LiteralPath $taskSource).Hash
if(Test-Path -LiteralPath $taskRecord){
 $taskPrevious=Get-Content -LiteralPath $taskRecord -Raw | ConvertFrom-Json
 if(!(Test-Path -LiteralPath $taskWorker) -or (Get-FileHash -LiteralPath $taskWorker).Hash -ne $taskPrevious.workerHash){throw 'Private browser worker changed; no files replaced.'}
 if((Get-FileHash -LiteralPath $taskHost).Hash -ne $taskPrevious.hostHash){throw 'Private browser launcher changed; no files replaced.'}
 if($taskPrevious.sourceHash -eq $taskSourceHash){Write-Output 'Ally browser host is current.';return}
}
if(!(Test-Path -LiteralPath $taskHost)){throw 'Prepare the private Ally client first.'}
if($Install -and @(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -in @($taskHost,$taskWorker)}).Count){throw 'The private browser host is active; no files replaced.'}
New-Item -ItemType Directory -Path $taskBuild -Force | Out-Null
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $taskCompiler /nologo /target:exe /optimize+ /reference:System.Web.Extensions.dll "/out:$taskStaged" $taskSource
if($LASTEXITCODE -ne 0){throw 'Ally browser host compilation failed.'}
if(!$Install){Write-Output 'Ally browser host staged; runtime unchanged.';return}
# Preserve the original native-AOT worker verbatim. Never touch the installed app.
if(!(Test-Path -LiteralPath $taskWorker)){Copy-Item -LiteralPath $taskHost -Destination $taskWorker}
Copy-Item -LiteralPath $taskStaged -Destination ($taskHost+'.staged') -Force
Move-Item -LiteralPath ($taskHost+'.staged') -Destination $taskHost -Force
@{sourceHash=$taskSourceHash;hostHash=(Get-FileHash -LiteralPath $taskHost).Hash;workerHash=(Get-FileHash -LiteralPath $taskWorker).Hash} | ConvertTo-Json | Set-Content -LiteralPath $taskRecord
Write-Output 'Installed Ally browser host with a private-profile worker.'
