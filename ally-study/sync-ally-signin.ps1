param([string]$SourceProfile=(Join-Path $env:LOCALAPPDATA 'HeyClicky'))
$ErrorActionPreference='Stop'
$destination=Join-Path $PSScriptRoot 'profile'
if([IO.Path]::GetFullPath($SourceProfile).TrimEnd('\') -eq [IO.Path]::GetFullPath($destination).TrimEnd('\')){
 throw 'Source and private profile must be different directories.'
}
$names=@('auth.bin','device-registration.json')
foreach($name in $names){
 if(!(Test-Path -LiteralPath (Join-Path $SourceProfile $name) -PathType Leaf)){
  throw "The existing profile has no $name. No files copied."
 }
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$copied=@()
foreach($name in $names){
 $source=Join-Path $SourceProfile $name
 $target=Join-Path $destination $name
 $staged=$target+'.signin-staged'
 $sourceHash=(Get-FileHash -LiteralPath $source).Hash
 Copy-Item -LiteralPath $source -Destination $staged -ErrorAction Stop
 if((Get-FileHash -LiteralPath $staged).Hash -ne $sourceHash){throw 'Source changed during copy. Private file not replaced.'}
 if(Test-Path -LiteralPath $target){
  $backupDirectory=Join-Path $PSScriptRoot ('signin-backup\'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fffffff'))
  New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
  Copy-Item -LiteralPath $target -Destination (Join-Path $backupDirectory $name)
 }
 Move-Item -LiteralPath $staged -Destination $target -Force
 if((Get-FileHash -LiteralPath $target).Hash -ne $sourceHash){throw 'Copied file verification failed.'}
 $copied+=$name
}
$receipt=@{copiedFiles=$copied;copiesVerified=$true;nativeLaunchPerformed=$false;authorizationCheckChanged=$false;sessionValidityVerified=$false}
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'ally-signin-sync.json')
$receipt | ConvertTo-Json
