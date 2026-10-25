# Static assembly transformation; does not launch the client or call a provider.
param([Parameter(Mandatory=$true)]$Module)
$ErrorActionPreference='Stop'
function Get-AllyModuleTypes($items){foreach($item in $items){$item;Get-AllyModuleTypes $item.NestedTypes}}
$owner=$Module.Types | Where-Object FullName -eq 'HeyClicky.Core.Voice.CompanionSession'
$targetMethod=$owner.Methods | Where-Object Name -eq 'RefusedOverMessageCap'
if(!$targetMethod -or !$targetMethod.HasThis -or $targetMethod.Parameters.Count -ne 1 -or $targetMethod.ReturnType.FullName -ne 'System.Boolean'){
 throw 'Unexpected target method signature; assembly was not changed.'
}
$calls=@(foreach($type in (Get-AllyModuleTypes $Module.Types)){
 foreach($method in $type.Methods){
  if(!$method.HasBody){continue}
  foreach($instruction in $method.Body.Instructions){
   if($instruction.Operand -is [Mono.Cecil.MethodReference] -and $instruction.Operand.FullName -eq $targetMethod.FullName){
    if($instruction.OpCode.Code -ne [Mono.Cecil.Cil.Code]::Call){throw 'Unexpected target method reference.'}
    [PSCustomObject]@{Method=$method;Instruction=$instruction}
   }
  }
 }
})
if($calls.Count -ne 4){throw "Expected four target method calls; found $($calls.Count)."}
foreach($call in $calls){
 # Preserve operand stack balance and branch targets while rewriting calls.
 $instruction=$call.Instruction
 $instruction.OpCode=[Mono.Cecil.Cil.OpCodes]::Pop
 $instruction.Operand=$null
 $il=$call.Method.Body.GetILProcessor()
 $receiver=[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Pop)
 $il.InsertAfter($instruction,$receiver)
 $il.InsertAfter($receiver,[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldc_I4_0))
 # Added instructions can put a formerly short branch out of range.
 foreach($branch in $call.Method.Body.Instructions){
  if($branch.OpCode.OperandType -eq [Mono.Cecil.Cil.OperandType]::ShortInlineBrTarget){
   $longName=$branch.OpCode.Code.ToString() -replace '_S$',''
   $branch.OpCode=[Mono.Cecil.Cil.OpCodes].GetField($longName).GetValue($null)
  }
 }
}
$null=$owner.Methods.Remove($targetMethod)
Write-Output 'Client assembly updated.'
