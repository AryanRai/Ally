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
$taskReady=$taskTarget+'.surface-ready'
$taskAssembly.Write($taskReady);$taskAssembly.Dispose();$taskAdapter.Dispose()
$taskCheck=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($taskReady,$taskReader)
$taskCheckType=$taskCheck.MainModule.Types | Where-Object FullName -eq 'HeyClicky.App.Notch.NotchView'
$taskCalls=@(($taskCheckType.Methods | Where-Object Name -eq '.ctor').Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq $taskAttach.FullName})
if($taskCalls.Count -ne 1){throw 'Native adapter initialization did not serialize exactly once.'}
$taskCheck.Dispose()
if($Install){
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
