Add-Type -Path (Join-Path $PSScriptRoot 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
function Types($ts){foreach($t in $ts){$t;Types $t.NestedTypes}}
foreach($fn in @('HeyClicky.Core.dll','HeyClicky.Platform.dll','HeyClicky.dll')){
 $a=[Mono.Cecil.AssemblyDefinition]::ReadAssembly((Join-Path (Join-Path $PSScriptRoot 'client') $fn))
 foreach($t in (Types $a.MainModule.Types)){foreach($m in $t.Methods){if(!$m.HasBody){continue}; $ss=@($m.Body.Instructions | Where-Object {$_.OpCode.Code -eq 'Ldstr'} | ForEach-Object {$_.Operand}); if(($ss -contains 'HeyClicky' -and $ss.Count -lt 18 -and ($t.FullName -match 'Path|Log|Config|Store|Auth|State' -or $m.Name -match 'Directory|Path')) -or $m.Name -eq 'ProgramCode' -or ($t.FullName -match 'Deepgram' -and ($ss -join ' ') -match 'wss://')){Write-Output ($fn+' '+$t.FullName+'::'+$m.Name); if($m.Body.Instructions.Count -lt 100){$m.Body.Instructions | ForEach-Object ToString}else{$ss}}}}
}
