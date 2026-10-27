param([switch]$Install)
$ErrorActionPreference='Stop'
$taskExe=Join-Path $PSScriptRoot 'client\AllyStudy.exe'
$taskArguments=@((Join-Path $PSScriptRoot 'native\ally_identity.py'))
if($Install){
 $taskArguments+='--install'
 $taskActive=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq $taskExe})
 if(!$taskActive.Count){$taskArguments+='--install-exe'}
}
& python.exe @taskArguments
if($LASTEXITCODE -ne 0){throw 'Ally identity preparation failed.'}
if($Install -and $taskActive.Count){Write-Output 'Ally assets installed; apphost icon staged until the private native app is closed.'}
