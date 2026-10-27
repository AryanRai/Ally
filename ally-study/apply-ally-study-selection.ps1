param([switch]$Install,[string]$ClientPath)
$ErrorActionPreference='Stop'
$taskClient=if($ClientPath){$ClientPath}else{Join-Path $PSScriptRoot 'client'}
$taskTarget=Join-Path $taskClient 'HeyClicky.Core.dll'
if($Install -and @(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq (Join-Path $taskClient 'AllyStudy.exe')}).Count){throw 'Close private Ally Study before installing selection alignment.'}
Add-Type -Path (Join-Path $PSScriptRoot 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
$taskReader=New-Object Mono.Cecil.ReaderParameters
$taskResolver=New-Object Mono.Cecil.DefaultAssemblyResolver
$taskResolver.AddSearchDirectory($taskClient);$taskReader.AssemblyResolver=$taskResolver
$taskResolver.AddSearchDirectory((Join-Path $PSScriptRoot 'client'))
$taskAssembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($taskTarget,$taskReader)
$taskHelper=[Mono.Cecil.AssemblyDefinition]::ReadAssembly((Join-Path $taskClient 'Ally.Surface.dll'),$taskReader)
try {
 $taskSurface=$taskHelper.MainModule.Types | Where-Object FullName -eq 'Ally.Native.Surface'
 $taskSelect=$taskSurface.Methods | Where-Object Name -eq 'SelectStudyFrame'
 $taskSession=$taskAssembly.MainModule.Types | Where-Object FullName -eq 'HeyClicky.Core.Voice.CompanionSession'
 $taskState=$taskSession.NestedTypes | Where-Object Name -match '^<RunTurnAsync>d__'
 $taskMethod=$taskState.Methods | Where-Object Name -eq 'MoveNext'
 $taskStores=@($taskMethod.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Stfld' -and $_.Operand.Name -eq 'cursorFrame'})
 $taskClosure=$taskState.Fields | Where-Object {$_.FieldType.FullName -eq $taskStores[0].Operand.DeclaringType.FullName}
 if(!$taskSelect -or $taskStores.Count -ne 1 -or !$taskClosure){throw 'Study frame selection differs from the reviewed native build.'}
 $taskCall=$taskAssembly.MainModule.ImportReference($taskSelect)
 $taskExisting=@($taskMethod.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq $taskCall.FullName})
 if($taskExisting.Count -eq 0){
  $taskIl=$taskMethod.Body.GetILProcessor();$taskStore=$taskStores[0]
  # Stack before stfld: closure, chosen frame. Pass that frame and this turn's
  # closure, then cast the helper's selected frame back to the original type.
  $taskIl.InsertBefore($taskStore,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldarg_0))
  $taskIl.InsertBefore($taskStore,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldfld,$taskClosure))
  $taskIl.InsertBefore($taskStore,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Call,$taskCall))
  $taskIl.InsertBefore($taskStore,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Castclass,$taskStore.Operand.FieldType))
  # Preserve branch targets without risking short-branch overflow after insertion.
  foreach($taskInstruction in $taskMethod.Body.Instructions){
   if($taskInstruction.OpCode.OperandType -eq [Mono.Cecil.Cil.OperandType]::ShortInlineBrTarget){
    $taskLong=$taskInstruction.OpCode.Name.Replace('.s','').Replace('.','_')
    $taskInstruction.OpCode=[Mono.Cecil.Cil.OpCodes].GetField($taskLong,[Reflection.BindingFlags]'Public,Static,IgnoreCase').GetValue($null)
   }
  }
 } elseif($taskExisting.Count -ne 1){throw 'Duplicate selection frame binding.'}
 $taskReady=$taskTarget+'.selection-ready';$taskAssembly.Write($taskReady)
} finally {$taskAssembly.Dispose();$taskHelper.Dispose()}
$taskVerified=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($taskReady,$taskReader)
try {
 $taskVerifiedMethod=(($taskVerified.MainModule.Types | Where-Object FullName -eq 'HeyClicky.Core.Voice.CompanionSession').NestedTypes | Where-Object Name -match '^<RunTurnAsync>d__').Methods | Where-Object Name -eq 'MoveNext'
 if(@($taskVerifiedMethod.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.Name -eq 'SelectStudyFrame'}).Count -ne 1){throw 'Selection frame binding did not serialize.'}
} finally {$taskVerified.Dispose()}
if($Install){Move-Item -LiteralPath $taskReady -Destination $taskTarget -Force}
[pscustomobject]@{selectionFrameBound=$true;installed=[bool]$Install;cursorFallbackForOtherTurnsPreserved=$true}
