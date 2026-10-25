param([string]$Root=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$taskHash=[Security.Cryptography.SHA256]::Create()
$taskStream=New-Object IO.MemoryStream
try {
 $taskFiles=@()
 foreach($taskDirectory in @('glass-pip-chat\src','glass-pip-chat\electron','glass-pip-chat\scripts','glass-pip-chat\assets','ally-study\native','ally-study\notch-ui','ally-study\usage')){
  $taskFiles+=Get-ChildItem -LiteralPath (Join-Path $Root $taskDirectory) -File -Recurse | Where-Object {$_.FullName -notmatch '\\node_modules\\'}
 }
 $taskFiles+=Get-ChildItem -LiteralPath (Join-Path $Root 'glass-pip-chat') -File | Where-Object {$_.Name -match '^(package.*\.json|.*\.html|.*config.*\.(ts|js|json))$'}
 $taskFiles+=Get-ChildItem -LiteralPath (Join-Path $Root 'ally-study') -File | Where-Object {$_.Extension -in @('.mjs','.ps1')}
 [string[]]$taskPaths=@($taskFiles | ForEach-Object {$_.FullName} | Select-Object -Unique)
 [Array]::Sort($taskPaths,[StringComparer]::Ordinal)
 foreach($taskFullName in $taskPaths){
  $taskRelative=$taskFullName.Substring($Root.TrimEnd('\').Length).Replace('\','/')
  $taskBytes=[Text.Encoding]::UTF8.GetBytes($taskRelative);$taskStream.Write($taskBytes,0,$taskBytes.Length)
  $taskBytes=[IO.File]::ReadAllBytes($taskFullName);$taskStream.Write($taskBytes,0,$taskBytes.Length)
 }
 [BitConverter]::ToString($taskHash.ComputeHash($taskStream.ToArray())).Replace('-','').ToLowerInvariant()
} finally {$taskHash.Dispose();$taskStream.Dispose()}
