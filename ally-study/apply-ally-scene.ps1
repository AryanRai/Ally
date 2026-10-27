param([switch]$Install)
$ErrorActionPreference='Stop'
$taskClient=Join-Path $PSScriptRoot 'client'
if(@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq (Join-Path $taskClient 'AllyStudy.exe')}).Count){throw 'Close Ally Study before preparing scene editing.'}
$taskEngine=Join-Path $taskClient 'Assets/Engine/clicky-draw-engine.js'
$taskBaseline=$taskEngine+'.scene-baseline'
if(!(Test-Path -LiteralPath $taskBaseline)){Copy-Item -LiteralPath $taskEngine -Destination $taskBaseline}
& node.exe (Join-Path $PSScriptRoot 'ally-scene-patch.mjs') $taskBaseline ($taskEngine+'.scene-staged')
if($LASTEXITCODE -ne 0){throw 'Native scene engine validation failed.'}
$taskNative=Join-Path $taskClient 'Assets/Engine/clicky-draw-native.js'
$taskNativeBaseline=$taskNative+'.scene-baseline'
if(!(Test-Path -LiteralPath $taskNativeBaseline)){Copy-Item -LiteralPath $taskNative -Destination $taskNativeBaseline}
& node.exe (Join-Path $PSScriptRoot 'ally-scene-patch.mjs') $taskNativeBaseline ($taskNative+'.scene-staged') --native
if($LASTEXITCODE -ne 0){throw 'Native hidden-scene readback validation failed.'}
if($Install){
 Move-Item -LiteralPath ($taskEngine+'.scene-staged') -Destination $taskEngine -Force
 Move-Item -LiteralPath ($taskNative+'.scene-staged') -Destination $taskNative -Force
}
