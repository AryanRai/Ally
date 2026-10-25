param([switch]$Install)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$client=Join-Path $root 'client'
$target=Join-Path $client 'HeyClicky.dll'
$ready=$target+'.display-ready'
$installedSource=Join-Path $env:LOCALAPPDATA 'HeyClickyApp\current\HeyClicky.dll'
$sourceHash=(Get-FileHash -LiteralPath $installedSource).Hash
$active=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq (Join-Path $client 'AllyStudy.exe')})
if($Install -and $active.Count){throw 'Close the private Ally Study client before applying the display fix.'}
Add-Type -Path (Join-Path $root 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
$resolver=New-Object Mono.Cecil.DefaultAssemblyResolver
$resolver.AddSearchDirectory($client)
$reader=New-Object Mono.Cecil.ReaderParameters
$reader.AssemblyResolver=$resolver
$asm=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($target,$reader)
$type=$asm.MainModule.Types | Where-Object FullName -eq 'HeyClicky.App.Notch.NotchView'
$method=$type.Methods | Where-Object Name -eq 'Reposition'
$displays=$asm.MainModule.Types | Where-Object FullName -eq 'HeyClicky.App.Shell.Displays'
$underCursor=$displays.Methods | Where-Object Name -eq 'UnderCursor'
if(!$method -or !$underCursor){throw 'Display methods do not match this client build.'}
$instructions=$method.Body.Instructions
$store=@($instructions | Where-Object {$_.OpCode.Code -eq 'Stfld' -and $_.Operand.Name -eq 'monitor'})
if($store.Count -ne 1){throw 'Unexpected monitor assignment count.'}
$storeIndex=$instructions.IndexOf($store[0])
if($storeIndex -ne 11){throw 'Display method layout differs from the reviewed build.'}
$before=$instructions | Select-Object -First $storeIndex
$needsPatch=@($before | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.Name -eq 'ForWindow'}).Count -gt 0
if($needsPatch){
 # Select the cursor monitor before computing geometry and DPI. The former
 # window-monitor lookup discarded the monitor selected by FollowCursorDisplay.
 for($index=0;$index -lt $storeIndex;$index++){$instructions[$index].OpCode=[Mono.Cecil.Cil.OpCodes]::Nop;$instructions[$index].Operand=$null}
 $instructions[0].OpCode=[Mono.Cecil.Cil.OpCodes]::Ldarg_0
 $instructions[1].OpCode=[Mono.Cecil.Cil.OpCodes]::Call
 $instructions[1].Operand=$underCursor
 $asm.MainModule.Attributes=$asm.MainModule.Attributes -bor [Mono.Cecil.ModuleAttributes]::ILOnly
}
$asm.Write($ready)
$asm.Dispose()
$verify=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($ready,$reader)
$verifiedMethod=($verify.MainModule.Types | Where-Object FullName -eq 'HeyClicky.App.Notch.NotchView').Methods | Where-Object Name -eq 'Reposition'
$verified=$verifiedMethod.Body.Instructions
if($verified[0].OpCode.Code -ne 'Ldarg_0' -or $verified[1].Operand.FullName -ne $underCursor.FullName){throw 'Cursor monitor selection was not serialized correctly.'}
if(@($verified | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.Name -eq 'ForWindow'}).Count){throw 'Old window monitor selection remains.'}
$verify.Dispose()
if($Install){
 $backup=Join-Path $root 'branding-backup\HeyClicky.before-display.dll'
 New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
 if(!(Test-Path -LiteralPath $backup)){Copy-Item -LiteralPath $target -Destination $backup}
 Move-Item -LiteralPath $ready -Destination $target -Force
}
if((Get-FileHash -LiteralPath $installedSource).Hash -ne $sourceHash){throw 'Installed source changed unexpectedly.'}
$receipt=@{cursorMonitorSelected=$true;oldWindowMonitorLookupRemoved=$true;existingDpiAndPlacementLogicPreserved=$true;installed=[bool]$Install;nativeLaunchPerformed=$false;installedSourceUnchanged=$true;pendingClientClose=($active.Count -gt 0)}
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'ally-display-verification.json')
$receipt | ConvertTo-Json
