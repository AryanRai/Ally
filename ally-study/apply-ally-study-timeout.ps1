param([switch]$Install,[string]$InputAssembly)
$ErrorActionPreference='Stop'
$client=Join-Path $PSScriptRoot 'client'
$target=Join-Path $client 'HeyClicky.Core.dll'
$source=if($InputAssembly){$InputAssembly}else{$target}
$ready=$target+'.study-timeout-ready'
$active=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq (Join-Path $client 'AllyStudy.exe')})
if($Install -and $active.Count){throw 'Close private Ally Study before installing its timeout fix.'}
Add-Type -Path (Join-Path $PSScriptRoot 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
$resolver=New-Object Mono.Cecil.DefaultAssemblyResolver
$resolver.AddSearchDirectory($client)
$reader=New-Object Mono.Cecil.ReaderParameters
$reader.AssemblyResolver=$resolver
$assembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($source,$reader)
$brain=$assembly.MainModule.Types | Where-Object FullName -eq 'HeyClicky.Core.Brain.BrainClient'
$stream=$brain.NestedTypes | Where-Object Name -like '<StreamTurnAsync>*'
$method=$stream.Methods | Where-Object Name -eq 'MoveNext'
if(!$method -or !$method.HasBody){throw 'Reviewed native Study streaming implementation changed.'}
$matches=@()
foreach($instruction in $method.Body.Instructions){
  if($instruction.OpCode.Code -notin @('Ldc_I4_S','Ldc_I4') -or [int]$instruction.Operand -notin @(120,600,3600)){continue}
  $convert=$instruction.Next;$seconds=$convert.Next;$cancel=$seconds.Next
  if($convert.OpCode.Code -eq 'Conv_I8' -and $seconds.Operand -is [Mono.Cecil.MethodReference] -and $seconds.Operand.FullName -eq 'System.TimeSpan System.TimeSpan::FromSeconds(System.Int64)' -and $cancel.Operand -is [Mono.Cecil.MethodReference] -and $cancel.Operand.FullName -eq 'System.Void System.Threading.CancellationTokenSource::CancelAfter(System.TimeSpan)'){$matches+=,$instruction}
}
if($matches.Count -ne 1){throw 'Expected one exact 120-second native response deadline; nothing installed.'}
$was=[int]$matches[0].Operand
# Keep the linked user-cancellation token; only the automatic patience budget changes.
$matches[0].OpCode=[Mono.Cecil.Cil.OpCodes]::Ldc_I4
$matches[0].Operand=[int]3600
# The native narrator otherwise abandons delivery at 90 seconds even though
# the same agent turn is still streaming. Late speech then never releases marks.
# Match the one-hour response ceiling for heavy tool work, while retaining
# bridge inactivity checks and Finished/stillCurrent/user cancellation.
$companion=$assembly.MainModule.Types | Where-Object FullName -eq 'HeyClicky.Core.Voice.CompanionSession'
$narrator=$companion.NestedTypes | Where-Object Name -like '<NarrateAsync>*'
$narrate=$narrator.Methods | Where-Object Name -eq 'MoveNext'
if(!$narrate -or !$narrate.HasBody){throw 'Reviewed native narration implementation changed.'}
$narrationMatches=@($narrate.Body.Instructions | Where-Object {
 $_.OpCode.Code -eq 'Ldc_I4' -and [int]$_.Operand -in @(90000,600000,3600000) -and
 $_.Next.OpCode.Code -eq 'Conv_I8' -and $_.Next.Next.OpCode.Code -eq 'Add' -and
 $_.Next.Next.Next.OpCode.Code -eq 'Stfld' -and $_.Next.Next.Next.Operand.Name -eq '<firstLineDeadline>5__4'
})
if($narrationMatches.Count -ne 1){throw 'Expected one exact native first-speech deadline; nothing installed.'}
$narrationWas=[int]$narrationMatches[0].Operand
$narrationMatches[0].Operand=[int]3600000
$assembly.Write($ready);$assembly.Dispose()
if($Install){
  if($was -eq 120){Copy-Item -LiteralPath $target -Destination ($target+'.before-study-timeout')}
  Copy-Item -LiteralPath $ready -Destination $target -Force
}
[pscustomobject]@{assembly='HeyClicky.Core.dll';method='BrainClient.StreamTurnAsync';previousSeconds=$was;seconds=3600;narrationPreviousMs=$narrationWas;narrationMs=3600000;installed=[bool]$Install;ready=$ready} | ConvertTo-Json
