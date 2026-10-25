param([string]$Filter='RealtimeMouth|Deepgram|BrainSseParser|BrainReplyAccumulator|DrawingProgram|ProgramCode')
Add-Type -Path (Join-Path $PSScriptRoot 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
function Types($ts) { foreach($t in $ts){$t; Types $t.NestedTypes} }
$a=[Mono.Cecil.AssemblyDefinition]::ReadAssembly((Join-Path $PSScriptRoot 'client\HeyClicky.Core.dll'))
foreach($t in (Types $a.MainModule.Types)) {
 if($t.FullName -notmatch $Filter){continue}
 foreach($m in $t.Methods){
  if(!$m.HasBody){continue}
  if($m.Name -notmatch 'HandleServerEvent|HandleControlEvent|SendLine|BuildVerbatim|MintAsync|OpenAsync|HandleMessage|OnMessage|Dispatch|ProgramCode|MoveNext'){continue}
  $out=@()
  foreach($i in $m.Body.Instructions){
   if($i.OpCode.Code -eq 'Ldstr'){$out+=('STR '+$i.Operand)}
   if($i.Operand -is [Mono.Cecil.FieldReference] -and $i.Operand.Name -match '^[A-F0-9]{40,}$') {
    try { $f=$i.Operand.Resolve(); $out+=('UTF8 '+[Text.Encoding]::UTF8.GetString($f.InitialValue)) } catch{}
   }
  }
  if($out.Count){Write-Output ('METHOD '+$t.FullName+'::'+$m.Name); $out}
 }
}
