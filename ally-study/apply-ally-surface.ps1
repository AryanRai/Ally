param([switch]$Install)
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskClient=Join-Path $taskRoot 'client'
$taskTarget=Join-Path $taskClient 'HeyClicky.dll'
if(@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq (Join-Path $taskClient 'AllyStudy.exe')}).Count){throw 'Close Ally Study before preparing its native surface adapter.'}
Add-Type -Path (Join-Path $taskRoot 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
$taskHelper=Join-Path $taskClient 'Ally.Surface.dll'
$taskStagedHelper=Join-Path $taskClient ('Ally.Surface.'+[guid]::NewGuid().ToString('N')+'.dll')
Add-Type -Path (Join-Path $taskRoot 'native\AllySurface.cs') -OutputAssembly $taskStagedHelper -OutputType Library
$taskResolver=New-Object Mono.Cecil.DefaultAssemblyResolver
$taskResolver.AddSearchDirectory($taskClient)
$taskReader=New-Object Mono.Cecil.ReaderParameters
$taskReader.AssemblyResolver=$taskResolver
$taskAdapter=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($taskStagedHelper,$taskReader)
# Keep the CLR identity stable across builds, independent of the temporary filename.
$taskAdapter.Name.Name='Ally.Surface'
$taskAdapter.MainModule.Name='Ally.Surface.dll'
$taskAdapter.Write($taskHelper+'.staged')
$taskAdapter.Dispose()
$taskAdapter=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($taskHelper+'.staged',$taskReader)
$taskSource=if(Test-Path -LiteralPath ($taskTarget+'.notch-ready')){$taskTarget+'.notch-ready'}else{$taskTarget}
$taskAssembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($taskSource,$taskReader)
$taskModule=$taskAssembly.MainModule
$taskType=$taskModule.Types | Where-Object FullName -eq 'HeyClicky.App.Notch.NotchView'
$taskSurface=$taskAdapter.MainModule.Types | Where-Object FullName -eq 'Ally.Native.Surface'
if(!$taskType -or !$taskSurface){throw 'Surface adapter does not match the prepared client.'}
$taskAttach=$taskModule.ImportReference(($taskSurface.Methods | Where-Object Name -eq 'Attach'))
$taskSuppressed=$taskModule.ImportReference(($taskSurface.Methods | Where-Object Name -eq 'IsSuppressed'))
$taskBind=$taskModule.ImportReference(($taskSurface.Methods | Where-Object Name -eq 'BindStudy'))
$taskHomeAttach=$taskModule.ImportReference(($taskSurface.Methods | Where-Object Name -eq 'AttachHome'))
$taskChat=$taskModule.Types | Where-Object FullName -eq 'HeyClicky.App.Notch.Peek.NotchChatView'
$taskChatCtor=$taskChat.Methods | Where-Object Name -eq '.ctor'
$taskChatField=$taskChat.Fields | Where-Object Name -eq 'allyWebView'
if(!$taskChatCtor -or !$taskChatField){throw 'Embedded chat cache binding differs from reviewed client.'}
$taskChatIl=$taskChatCtor.Body.GetILProcessor()
$taskTakeWeb=$taskModule.ImportReference(($taskSurface.Methods | Where-Object Name -eq 'TakeChatWeb'))
$taskBindWeb=$taskModule.ImportReference(($taskSurface.Methods | Where-Object Name -eq 'BindChatWeb'))
$taskNavigateWeb=$taskModule.ImportReference(($taskSurface.Methods | Where-Object Name -eq 'NavigateChatWeb'))
foreach($taskInstruction in @($taskChatCtor.Body.Instructions)){
 if($taskInstruction.Operand -isnot [Mono.Cecil.MethodReference] -or $taskInstruction.Operand.DeclaringType.FullName -ne 'Microsoft.UI.Xaml.Controls.WebView2'){continue}
 if($taskInstruction.OpCode.Code -eq 'Newobj' -and $taskInstruction.Operand.Name -eq '.ctor'){
  $taskWebType=$taskInstruction.Operand.DeclaringType
  $taskInstruction.OpCode=[Mono.Cecil.Cil.OpCodes]::Call; $taskInstruction.Operand=$taskTakeWeb
  $taskChatIl.InsertAfter($taskInstruction,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Castclass,$taskWebType))
 } elseif($taskInstruction.Operand.Name -eq 'set_Source'){
  $taskInstruction.OpCode=[Mono.Cecil.Cil.OpCodes]::Call; $taskInstruction.Operand=$taskNavigateWeb
 }
}
if(!@($taskChatCtor.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq $taskBindWeb.FullName}).Count){
 foreach($taskReturn in @($taskChatCtor.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Ret'})){
  $taskChatIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldarg_0))
  $taskChatIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldarg_0))
  $taskChatIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldfld,$taskChatField))
  $taskChatIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Call,$taskBindWeb))
 }
}
$taskHome=$taskModule.Types | Where-Object FullName -eq 'HeyClicky.App.Notch.Peek.NotchHomeTab'
$taskHomeCtor=$taskHome.Methods | Where-Object Name -eq '.ctor'
if(!$taskHomeCtor -or $taskHomeCtor.Parameters.Count -ne 1){throw 'Native Home body differs from the reviewed client.'}
if(!@($taskHomeCtor.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq $taskHomeAttach.FullName}).Count){
 $taskIl=$taskHomeCtor.Body.GetILProcessor()
 foreach($taskReturn in @($taskHomeCtor.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Ret'})){
  $taskIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldarg_0))
  $taskIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldarg_1))
  $taskIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Call,$taskHomeAttach))
 }
}
# Only Home's default branch changes. Chats/settings/documents keep native sizing.
$taskLayout=$taskModule.Types | Where-Object Name -eq 'NotchPeekLayout'
$taskBody=$taskLayout.Methods | Where-Object Name -eq 'get_BodyHeight'
$taskBody.Body=New-Object Mono.Cecil.Cil.MethodBody($taskBody)
$taskBodyIl=$taskBody.Body.GetILProcessor()
$taskBodyIl.Append([Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldc_R8,[double]238))
$taskBodyIl.Append([Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ret))
$taskPanel=$taskLayout.Methods | Where-Object Name -eq 'PanelSize'
$taskHomeSize=@($taskPanel.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Ldc_R8' -and $_.Operand -in @([double]138,[double]272)})
if($taskHomeSize.Count -ne 1){throw 'Native Home panel sizing differs from the reviewed client.'}
$taskHomeAlreadySized=$taskHomeSize[0].Operand -eq [double]272
$taskHomeSize[0].Operand=[double]272
$taskPanelIl=$taskPanel.Body.GetILProcessor()
$taskHomeIndex=$taskPanel.Body.Instructions.IndexOf($taskHomeSize[0])
$taskReturnStart=$taskPanel.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Ret'} | Select-Object -Last 1
$taskReturnStart=$taskPanel.Body.Instructions[$taskPanel.Body.Instructions.IndexOf($taskReturnStart)-3]
if($taskReturnStart.OpCode.Code -ne 'Ldloc_0'){throw 'Native Home return block differs from the reviewed client.'}
if(!$taskHomeAlreadySized){$taskPanelIl.InsertAfter($taskPanel.Body.Instructions[$taskHomeIndex+1],[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Br,$taskReturnStart))}
$taskHost=$taskModule.Types | Where-Object FullName -eq 'HeyClicky.App.AppHost'
$taskWire=$taskHost.Methods | Where-Object Name -eq 'WireRealServices'
$taskStack=$taskModule.Types | Where-Object FullName -eq 'HeyClicky.App.Wiring.RealStack'
$taskCompanion=$taskStack.Methods | Where-Object Name -eq 'get_Companion'
if(!$taskWire -or !$taskCompanion){throw 'Native Study service binding does not match this client.'}
if(!@($taskWire.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq $taskBind.FullName}).Count){
 $taskIl=$taskWire.Body.GetILProcessor()
 foreach($taskReturn in @($taskWire.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Ret'})){
  $taskIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldarg_1))
  $taskIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Callvirt,$taskCompanion))
  $taskIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Call,$taskBind))
 }
}
$taskCtor=$taskType.Methods | Where-Object Name -eq '.ctor'
if(!@($taskCtor.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq $taskAttach.FullName}).Count){
 $taskIl=$taskCtor.Body.GetILProcessor()
 $taskReturn=$taskCtor.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Ret'} | Select-Object -Last 1
 $taskIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldarg_0))
 $taskIl.InsertBefore($taskReturn,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Call,$taskAttach))
}
foreach($taskName in @('Show','KeepOnTop','ApplyAmbientVisibility')){
 $taskMethod=$taskType.Methods | Where-Object Name -eq $taskName
 if(!$taskMethod -or !$taskMethod.HasBody){throw "Missing native surface method: $taskName"}
 if(@($taskMethod.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq $taskSuppressed.FullName}).Count){continue}
 $taskIl=$taskMethod.Body.GetILProcessor();$taskFirst=$taskMethod.Body.Instructions[0]
 $taskIl.InsertBefore($taskFirst,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Call,$taskSuppressed))
 $taskIl.InsertBefore($taskFirst,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Brfalse,$taskFirst))
 $taskIl.InsertBefore($taskFirst,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ret))
}
function SurfaceTypes($ts){foreach($t in $ts){$t;SurfaceTypes $t.NestedTypes}}
foreach($taskNested in (SurfaceTypes @($taskType))){foreach($taskMethod in $taskNested.Methods){
 if(!$taskMethod.HasBody){continue}
 foreach($taskInstruction in $taskMethod.Body.Instructions){
  if($taskInstruction.Operand -is [Mono.Cecil.MethodReference] -and $taskInstruction.Operand.DeclaringType.FullName -eq 'HeyClicky.App.Shell.OverlayWindow' -and $taskInstruction.Operand.Name -in @('ShowNoActivate','ShowActivated')){
   $taskHelperMethod=$taskSurface.Methods | Where-Object Name -eq $taskInstruction.Operand.Name
   $taskInstruction.OpCode=[Mono.Cecil.Cil.OpCodes]::Call
   $taskInstruction.Operand=$taskModule.ImportReference($taskHelperMethod)
  }
 }
}}
$taskModule.Attributes=$taskModule.Attributes -bor [Mono.Cecil.ModuleAttributes]::ILOnly
$taskDrawingPath=Join-Path $taskClient 'HeyClicky.Drawing.dll'
$taskDrawing=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($taskDrawingPath,$taskReader)
$taskSound=$taskDrawing.MainModule.Types | Where-Object FullName -eq 'HeyClicky.Drawing.Audio.SoundPlayer'
$taskStartSound=$taskSound.Methods | Where-Object Name -eq 'StartIfNeeded'
$taskSoundGuard=$taskDrawing.MainModule.ImportReference(($taskSurface.Methods | Where-Object Name -eq 'CanStartSoundMixer'))
if(!$taskStartSound){throw 'Native sound lifecycle differs from reviewed client.'}
if(!@($taskStartSound.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.Name -eq 'CanStartSoundMixer'}).Count){
 $taskSoundCreate=@($taskStartSound.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Stfld' -and $_.Operand.Name -eq 'running'})
 if($taskSoundCreate.Count -ne 1){throw 'Sound start guard location differs from reviewed client.'}
 $taskSoundBegin=$taskStartSound.Body.Instructions[$taskStartSound.Body.Instructions.IndexOf($taskSoundCreate[0])-3]
 if($taskSoundBegin.OpCode.Code -ne 'Ldarg_0'){throw 'Sound start instruction differs from reviewed client.'}
 $taskSoundEnd=$taskStartSound.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Ret'} | Select-Object -Last 1
 $taskSoundIl=$taskStartSound.Body.GetILProcessor()
 $taskFirstGuard=[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldarg_0)
 foreach($taskBranch in @($taskStartSound.Body.Instructions | Where-Object {$_.Operand -eq $taskSoundBegin})){$taskBranch.Operand=$taskFirstGuard}
 $taskSoundIl.InsertBefore($taskSoundBegin,$taskFirstGuard)
 $taskSoundIl.InsertBefore($taskSoundBegin,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Call,$taskSoundGuard))
 $taskSoundIl.InsertBefore($taskSoundBegin,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Brtrue,$taskSoundBegin))
 $taskSoundIl.InsertBefore($taskSoundBegin,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Leave,$taskSoundEnd))
}
$taskDrawing.MainModule.Attributes=$taskDrawing.MainModule.Attributes -bor [Mono.Cecil.ModuleAttributes]::ILOnly
$taskDrawing.Write($taskDrawingPath+'.audio-ready');$taskDrawing.Dispose()
$taskReady=$taskTarget+'.surface-ready'
$taskAssembly.Write($taskReady);$taskAssembly.Dispose();$taskAdapter.Dispose()
$taskCheck=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($taskReady,$taskReader)
$taskCheckType=$taskCheck.MainModule.Types | Where-Object FullName -eq 'HeyClicky.App.Notch.NotchView'
$taskCalls=@(($taskCheckType.Methods | Where-Object Name -eq '.ctor').Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq $taskAttach.FullName})
if($taskCalls.Count -ne 1){throw 'Native adapter initialization did not serialize exactly once.'}
$taskCheck.Dispose()
if($Install){
 $taskAudioBackup=Join-Path $taskRoot 'branding-backup\HeyClicky.Drawing.before-audio.dll'
 if(!(Test-Path -LiteralPath $taskAudioBackup)){Copy-Item -LiteralPath $taskDrawingPath -Destination $taskAudioBackup}
 # Replace the private directory entry, preserving any installed-source hard link.
 Copy-Item -LiteralPath ($taskDrawingPath+'.audio-ready') -Destination ($taskDrawingPath+'.audio-staged') -Force
 Move-Item -LiteralPath ($taskDrawingPath+'.audio-staged') -Destination $taskDrawingPath -Force
 # Replace private copied files atomically; never open a linked installed file for writing.
 [IO.File]::Copy($taskHelper+'.staged',$taskHelper,$true)
 [IO.File]::Copy($taskReady,$taskTarget,$true)
 $taskDeps=Join-Path $taskClient 'HeyClicky.deps.json'
 $taskJson=Get-Content -LiteralPath $taskDeps -Raw | ConvertFrom-Json
 $taskRuntime=$taskJson.targets.($taskJson.runtimeTarget.name).'HeyClicky/1.1.3'.runtime
 $taskRuntime | Add-Member -NotePropertyName 'Ally.Surface.dll' -NotePropertyValue ([pscustomobject]@{}) -Force
 $taskJson | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath ($taskDeps+'.surface-staged') -Encoding UTF8
 [IO.File]::Copy($taskDeps+'.surface-staged',$taskDeps,$true)
}
[IO.File]::Delete($taskStagedHelper)
@{version=1;installed=[bool]$Install;initializers=$taskCalls.Count;helperHash=(Get-FileHash -LiteralPath ($taskHelper+'.staged')).Hash;nativeHash=(Get-FileHash -LiteralPath $taskReady).Hash;runtimeValidated=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'ally-surface-verification.json')
Write-Output 'Prepared native notch/pill adapter; runtime interaction validation is pending.'
