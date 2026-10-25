$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskSource=Join-Path $env:LOCALAPPDATA 'HeyClickyApp\current'
$taskClient=Join-Path $taskRoot 'client'
$taskProfile=Join-Path $taskRoot 'profile'
Add-Type -Path (Join-Path $taskRoot 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
if((Test-Path -LiteralPath (Join-Path $taskClient 'HeyClicky.Core.dll')) -and (Get-Item -LiteralPath (Join-Path $taskClient 'HeyClicky.Core.dll')).Length -gt 0){throw 'A built client already exists. Do not overwrite a running copy.'}
New-Item -ItemType Directory -Path $taskClient,$taskProfile -Force | Out-Null
# Keep private runtime bytes together with Ally; never create writable links into an installed application.
foreach($taskFile in (Get-ChildItem -LiteralPath $taskSource -File)){
 if($taskFile.Name -eq 'HeyClicky.Core.dll'){continue}
 $taskClientName=if($taskFile.Name -eq 'HeyClicky.exe'){'AllyStudy.exe'}else{$taskFile.Name}
 if(!(Test-Path -LiteralPath (Join-Path $taskClient $taskClientName))){Copy-Item -LiteralPath $taskFile.FullName -Destination (Join-Path $taskClient $taskClientName)}
}
# Keep the renamed apphost paired with a matching WinUI resource index.
# Use a private copy so the shipped resource file is never edited.
Copy-Item -LiteralPath (Join-Path $taskSource 'HeyClicky.pri') -Destination (Join-Path $taskClient 'AllyStudy.pri') -ErrorAction Stop
foreach($taskDir in (Get-ChildItem -LiteralPath $taskSource -Directory)){
 if(!(Test-Path -LiteralPath (Join-Path $taskClient $taskDir.Name))){Copy-Item -LiteralPath $taskDir.FullName -Destination $taskClient -Recurse}
}
foreach($taskName in @('settings.json','auth.bin','app-config.json','analytics-identity.json','device-registration.json')){
 $taskOriginal=Join-Path $env:LOCALAPPDATA "HeyClicky\$taskName"
 if(Test-Path -LiteralPath $taskOriginal){Copy-Item -LiteralPath $taskOriginal -Destination (Join-Path $taskProfile $taskName)}
}
$taskSettings=Get-Content -LiteralPath (Join-Path $taskProfile 'settings.json') -Raw | ConvertFrom-Json
$taskSettings.launch_at_login=$false
$taskSettings.proactive_agent_suggestions_enabled=$false
$taskSettings.remote_tasks_enabled=$false
$taskSettings | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskProfile 'settings.json')
$taskResolver=New-Object Mono.Cecil.DefaultAssemblyResolver
$taskResolver.AddSearchDirectory($taskSource)
$taskReader=New-Object Mono.Cecil.ReaderParameters
$taskReader.AssemblyResolver=$taskResolver
$taskAssembly=[Mono.Cecil.AssemblyDefinition]::ReadAssembly((Join-Path $taskSource 'HeyClicky.Core.dll'),$taskReader)
$taskModule=$taskAssembly.MainModule
# The shipped managed assembly contains ReadyToRun code. Emit ordinary IL so
# the private copy is JIT compiled instead of retaining stale native code.
$taskModule.Attributes=$taskModule.Attributes -bor [Mono.Cecil.ModuleAttributes]::ILOnly
function AllTypes($ts){foreach($t in $ts){$t;AllTypes $t.NestedTypes}}
$taskChanges=@()
foreach($taskType in (AllTypes $taskModule.Types)){
 foreach($taskMethod in $taskType.Methods){
  if(!$taskMethod.HasBody){continue}
  foreach($taskInstruction in $taskMethod.Body.Instructions){
   if($taskInstruction.OpCode.Code -ne 'Ldstr'){continue}
   if($taskInstruction.Operand -eq 'wss://api.deepgram.com/v1/listen?'){
    $taskInstruction.Operand='ws://127.0.0.1:18783/voice/listen?'
    $taskChanges+=($taskType.FullName+'::'+$taskMethod.Name+' -> Ally transcription')
   }
   if($taskInstruction.Operand -eq 'wss://api.openai.com/v1/realtime?model='){
    $taskInstruction.Operand='ws://127.0.0.1:18783/voice/realtime?model='
    $taskChanges+=($taskType.FullName+'::'+$taskMethod.Name+' -> Ally speech output')
   }
  }
 }
}
& (Join-Path $taskRoot 'update-ally-client.ps1') -Module $taskModule
$taskChanges+='CompanionSession IL updated'
if($taskChanges.Count -ne 3){throw "Unexpected patch count $($taskChanges.Count); no client will be written."}
$taskAssembly.Write((Join-Path $taskClient 'HeyClicky.Core.dll'))
$taskAssembly.Dispose()
& (Join-Path $taskRoot 'apply-ally-branding.ps1') -Root $taskRoot
& (Join-Path $taskRoot 'apply-ally-display.ps1') -Install
& (Join-Path $taskRoot 'apply-ally-notch.ps1') -Install
@{builtAt=[DateTime]::UtcNow.ToString('o');source=$taskSource;profile=$taskProfile;changes=$taskChanges;originalCoreHash=(Get-FileHash -LiteralPath (Join-Path $taskSource 'HeyClicky.Core.dll')).Hash;clientCoreHash=(Get-FileHash -LiteralPath (Join-Path $taskClient 'HeyClicky.Core.dll')).Hash} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskRoot 'client-build.json')
Write-Output 'Prepared separate own-backend client; installed files unchanged.'

