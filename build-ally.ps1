param([switch]$StageOnly)
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskHash=& (Join-Path $taskRoot 'tools\get-ally-source-hash.ps1') -Root $taskRoot
$taskBuildRelative='.local\builds\unified-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$taskBuild=Join-Path $taskRoot $taskBuildRelative
$taskDesktop=Join-Path $taskBuild 'glass-pip-chat'
$taskSource=Join-Path $taskRoot 'glass-pip-chat'
if(!(Test-Path -LiteralPath (Join-Path $taskSource 'node_modules\electron\dist\electron.exe'))){throw 'Install the Ally desktop dependencies first.'}
New-Item -ItemType Directory -Path $taskDesktop -Force | Out-Null
foreach($taskDirectory in @('src','electron','scripts','assets')){Copy-Item -LiteralPath (Join-Path $taskSource $taskDirectory) -Destination $taskDesktop -Recurse}
Get-ChildItem -LiteralPath $taskSource -File | Where-Object {$_.Name -match '^(package.*\.json|.*\.html|.*config.*\.(ts|js|json))$'} | Copy-Item -Destination $taskDesktop
New-Item -ItemType Junction -Path (Join-Path $taskDesktop 'node_modules') -Target (Join-Path $taskSource 'node_modules') | Out-Null
New-Item -ItemType Junction -Path (Join-Path $taskBuild 'speech-service') -Target (Join-Path $taskRoot 'speech-service') | Out-Null
Push-Location $taskDesktop
try {
 & node.exe 'node_modules\vite\bin\vite.js' build
 if($LASTEXITCODE -ne 0){throw 'Desktop renderer build failed.'}
 & node.exe 'scripts\build-electron.js'
 if($LASTEXITCODE -ne 0){throw 'Desktop main-process build failed.'}
} finally {Pop-Location}
& node.exe (Join-Path $taskRoot 'ally-study\ally-scene-patch.mjs') (Join-Path $taskRoot 'ally-study\client\Assets\Engine\clicky-draw-engine.js') (Join-Path $taskBuild 'native-scene-engine.js')
if($LASTEXITCODE -ne 0){throw 'Native scene engine staging failed.'}
& node.exe (Join-Path $taskRoot 'ally-study\ally-scene-patch.mjs') (Join-Path $taskRoot 'ally-study\client\Assets\Engine\clicky-draw-native.js') (Join-Path $taskBuild 'native-scene-shim.js') --native
if($LASTEXITCODE -ne 0){throw 'Native hidden-scene readback staging failed.'}
& node.exe (Join-Path $taskRoot 'ally-study\build-ally-notch.mjs')
if($LASTEXITCODE -ne 0){throw 'Embedded chat build failed.'}
if(!$StageOnly){foreach($taskPatch in @('apply-ally-display.ps1','apply-ally-notch.ps1','apply-ally-surface.ps1','apply-ally-settings.ps1','apply-ally-study-timeout.ps1','apply-ally-study-selection.ps1','apply-ally-browser-host.ps1','apply-ally-identity.ps1')){
 & powershell.exe -NoProfile -File (Join-Path $taskRoot ('ally-study\'+$taskPatch)) -Install
 if($LASTEXITCODE -ne 0){throw "Native preparation failed: $taskPatch"}
}}
if((& (Join-Path $taskRoot 'tools\get-ally-source-hash.ps1') -Root $taskRoot) -ne $taskHash){throw 'Source changed during the build. The candidate is preserved; rebuild before activating.'}
$taskManifest=@{version=1;desktop=$taskBuildRelative+'\glass-pip-chat';sourceHash=$taskHash;sourceHashVersion=2;builtAt=[DateTime]::UtcNow.ToString('o');nativeRuntimeValidated=$false}
if($StageOnly){
 $taskManifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskBuild 'build-manifest.json')
 Write-Output ('Staged unified Ally at '+$taskBuild+'. Native files and active manifest are unchanged; install native adapters and activate only when idle.')
 return
}
$taskManifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot '.local\unified-build.json.staged')
Move-Item -LiteralPath (Join-Path $taskRoot '.local\unified-build.json.staged') -Destination (Join-Path $taskRoot '.local\unified-build.json') -Force
Write-Output 'Built unified Ally. No app was launched or restarted.'
