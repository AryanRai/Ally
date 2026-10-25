param([switch]$Install,[string]$InputAssembly)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$client=Join-Path $root 'client'
$target=Join-Path $client 'HeyClicky.dll'
$source=if($InputAssembly){$InputAssembly}else{$target}
$ready=$target+'.settings-ready'
$privateHash=(Get-FileHash -LiteralPath $target).Hash
$installed=Join-Path $env:LOCALAPPDATA 'HeyClickyApp\current\HeyClicky.dll'
$installedHash=if(Test-Path -LiteralPath $installed){(Get-FileHash -LiteralPath $installed).Hash}else{$null}
$active=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq (Join-Path $client 'AllyStudy.exe')})
if($Install -and $active.Count){throw 'Close Ally Study before installing the Settings update.'}
Add-Type -Path (Join-Path $root 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
$resolver=New-Object Mono.Cecil.DefaultAssemblyResolver
$resolver.AddSearchDirectory($client)
$reader=New-Object Mono.Cecil.ReaderParameters
$reader.AssemblyResolver=$resolver
$asm=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($source,$reader)
$module=$asm.MainModule
$settings=$module.Types | Where-Object FullName -eq 'HeyClicky.App.Settings.SettingsContent'
$header=$module.Types | Where-Object FullName -eq 'HeyClicky.App.UI.HeaderPills'
$homeTab=$module.Types | Where-Object FullName -eq 'HeyClicky.App.Notch.Peek.NotchHomeTab'
if(!$settings -or !$header -or !$homeTab){throw 'Native Settings types differ from the reviewed build.'}
$refs=@($module.GetMemberReferences())
function Ref([string]$full){$found=@($refs | Where-Object FullName -eq $full);if($found.Count -ne 1){throw "Expected one member: $full"};return $found[0]}
function Reset-Body($method){$method.Body=New-Object Mono.Cecil.Cil.MethodBody($method);$method.Body.InitLocals=$true;$script:il=$method.Body.GetILProcessor()}
function Emit([string]$code,$operand=$null){
 $op=[Mono.Cecil.Cil.OpCodes]::$code
 if($null -eq $operand){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op));return}
 if($operand -is [Mono.Cecil.MethodReference]){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op,[Mono.Cecil.MethodReference]$operand));return}
 if($operand -is [Mono.Cecil.Cil.Instruction]){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op,[Mono.Cecil.Cil.Instruction]$operand));return}
 if($operand -is [double]){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op,[double]$operand));return}
 if($operand -is [string]){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op,[string]$operand));return}
 throw "Unsupported operand: $operand"
}
function Nop($instruction){$instruction.OpCode=[Mono.Cecil.Cil.OpCodes]::Nop;$instruction.Operand=$null}
$plan=$settings.Methods | Where-Object Name -eq 'PlanGroup'
$account=$settings.Methods | Where-Object Name -eq 'AccountPage'
$alreadyPatched=@($plan.Body.Instructions | Where-Object Operand -eq 'ALLY_USAGE_URL').Count -eq 1
$webCtor=Ref 'System.Void Microsoft.UI.Xaml.Controls.WebView2::.ctor()'
$webDefinition=$webCtor.DeclaringType.Resolve()
$sourceSetter=$module.ImportReference(($webDefinition.Methods | Where-Object Name -eq 'set_Source'))
Reset-Body $plan
Emit Newobj $webCtor
Emit Dup;Emit Ldc_R8 ([double]560);Emit Callvirt (Ref 'System.Void Microsoft.UI.Xaml.FrameworkElement::set_Height(System.Double)')
Emit Dup;Emit Ldstr 'ALLY_USAGE_URL';Emit Call (Ref 'System.String System.Environment::GetEnvironmentVariable(System.String)')
$uri=[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Newobj,[Mono.Cecil.MethodReference](Ref 'System.Void System.Uri::.ctor(System.String)'))
Emit Dup;Emit Brtrue $uri;Emit Pop;Emit Ldstr 'http://127.0.0.1:18783/usage/'
$script:il.Append($uri);Emit Callvirt $sourceSetter;Emit Ret

# Keep both original account/sign-in branches, with usage visible in either state.
if(!$alreadyPatched){
 $instructions=$account.Body.Instructions
 $signIn=@($instructions | Where-Object {$_.OpCode.Code -eq 'Ldstr' -and $_.Operand -eq 'Sign in to sync your plan, connect integrations, and let agents work for you.'})
 if($signIn.Count -ne 1){throw 'Signed-out account layout differs from the reviewed build.'}
 $start=$instructions.IndexOf($signIn[0])
 $add=$null
 for($i=$start;$i -lt $instructions.Count;$i++){if($instructions[$i].Operand -is [Mono.Cecil.MethodReference] -and $instructions[$i].Operand.FullName -eq 'System.Void Microsoft.UI.Xaml.Controls.UIElementCollection::Add(Microsoft.UI.Xaml.UIElement)'){$add=$instructions[$i];break}}
 if(!$add){throw 'Signed-out account insertion point missing.'}
 $anchor=$add.Next
 $accountIl=$account.Body.GetILProcessor()
 foreach($instruction in @(
  [Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Dup),
  [Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Callvirt,[Mono.Cecil.MethodReference](Ref 'Microsoft.UI.Xaml.Controls.UIElementCollection Microsoft.UI.Xaml.Controls.Panel::get_Children()')),
  [Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ldarg_0),
  [Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Call,[Mono.Cecil.MethodReference]$plan),
  [Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Callvirt,[Mono.Cecil.MethodReference](Ref 'System.Void Microsoft.UI.Xaml.Controls.UIElementCollection::Add(Microsoft.UI.Xaml.UIElement)'))
 )){$accountIl.InsertBefore($anchor,$instruction)}
}
foreach($instruction in $account.Body.Instructions){
 if($instruction.OpCode.Code -ne 'Ldstr'){continue}
 if($instruction.Operand -eq 'Your plan, usage, and account.'){$instruction.Operand='Your Codex and Claude usage, and account.'}
 if($instruction.Operand -eq 'Sign in to sync your plan, connect integrations, and let agents work for you.'){$instruction.Operand='Sign in to connect integrations and sync your account.'}
}

# Omit only the Invite sidebar tuple; retain all remaining page identifiers.
$sidebar=$settings.Methods | Where-Object Name -eq 'SyncSidebar'
$instructions=$sidebar.Body.Instructions
$invite=@($instructions | Where-Object {$_.OpCode.Code -eq 'Ldstr' -and $_.Operand -eq 'Invite & Earn'})
if($invite.Count -eq 1){
 $index=$instructions.IndexOf($invite[0])
 if($instructions[$index-3].OpCode.Code -ne 'Dup' -or $instructions[$index+3].OpCode.Code -ne 'Stelem_Any'){throw 'Invite tuple differs from the reviewed build.'}
 $array=$null
 for($i=$index-1;$i -ge 0;$i--){if($instructions[$i].OpCode.Code -eq 'Newarr'){$array=$instructions[$i];break}}
 if(!$array -or $array.Previous.OpCode.Code -ne 'Ldc_I4_3'){throw 'Account sidebar array differs from the reviewed build.'}
 $array.Previous.OpCode=[Mono.Cecil.Cil.OpCodes]::Ldc_I4_2
 for($i=$index-3;$i -le $index+3;$i++){Nop $instructions[$i]}
}elseif(!$alreadyPatched){throw 'Expected one Invite sidebar entry.'}
foreach($instruction in $instructions){if($instruction.OpCode.Code -eq 'Ldstr' -and $instruction.Operand -eq 'HEYCLICKY'){$instruction.Operand='ALLY'}}

# Suppress only promotion presentation, without changing provider or account policy.
Reset-Body ($header.Methods | Where-Object Name -eq 'ShowsUpgrade');Emit Ldc_I4_0;Emit Ret
$footer=$homeTab.Methods | Where-Object Name -eq 'BuildFooter'
$instructions=$footer.Body.Instructions
$referral=@($instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.Name -eq 'ReferralButton'})
if($referral.Count -eq 1){
 $index=$instructions.IndexOf($referral[0])
 if($instructions[$index-4].OpCode.Code -ne 'Ldarg_0' -or $instructions[$index+1].Operand.Name -ne 'Add'){throw 'Invite footer differs from the reviewed build.'}
 for($i=$index-4;$i -le $index+1;$i++){Nop $instructions[$i]}
}elseif(!$alreadyPatched){throw 'Expected one Invite footer control.'}
$module.Attributes=$module.Attributes -bor [Mono.Cecil.ModuleAttributes]::ILOnly
$asm.Write($ready);$asm.Dispose()

$verify=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($ready,$reader)
function Types($ts){foreach($t in $ts){$t;Types $t.NestedTypes}}
$methods=0
foreach($type in (Types $verify.MainModule.Types)){foreach($method in $type.Methods){if(!$method.HasBody){continue};$methods++
 foreach($instruction in $method.Body.Instructions){
  if($instruction.Operand -is [Mono.Cecil.Cil.Instruction] -and !$method.Body.Instructions.Contains($instruction.Operand)){throw "Invalid branch in $($method.FullName)"}
  if($instruction.Operand -is [Mono.Cecil.Cil.Instruction[]]){foreach($jump in $instruction.Operand){if(!$method.Body.Instructions.Contains($jump)){throw "Invalid switch in $($method.FullName)"}}}
 }
}}
$verifiedSettings=$verify.MainModule.Types | Where-Object FullName -eq $settings.FullName
if(!(($verifiedSettings.Methods | Where-Object Name -eq 'PlanGroup').Body.Instructions.Operand -contains 'ALLY_USAGE_URL')){throw 'Usage navigation missing.'}
if((($verifiedSettings.Methods | Where-Object Name -eq 'SyncSidebar').Body.Instructions.Operand -contains 'Invite & Earn')){throw 'Invite entry remains.'}
$verify.Dispose()
if($Install){
 $backup=Join-Path $root 'branding-backup\HeyClicky.before-settings.dll'
 New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
 if(!(Test-Path -LiteralPath $backup)){Copy-Item -LiteralPath $target -Destination $backup}
 Move-Item -LiteralPath $ready -Destination $target -Force
}
if($installedHash -and (Get-FileHash -LiteralPath $installed).Hash -ne $installedHash){throw 'Installed application changed unexpectedly.'}
if(!$Install -and (Get-FileHash -LiteralPath $target).Hash -ne $privateHash){throw 'Live private assembly changed unexpectedly.'}
@{usageSettings=$true;inviteRemoved=$true;upgradeHidden=$true;methodsAudited=$methods;installed=[bool]$Install;nativeLaunchPerformed=$false} | ConvertTo-Json
