param([switch]$Install)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$client=Join-Path $root 'client'
$target=Join-Path $client 'HeyClicky.dll'
$source=if(Test-Path -LiteralPath ($target+'.display-ready')){$target+'.display-ready'}else{$target}
$ready=$target+'.notch-ready'
$installedSource=Join-Path $env:LOCALAPPDATA 'HeyClickyApp\current\HeyClicky.dll'
$sourceHash=(Get-FileHash -LiteralPath $installedSource).Hash
$privateHash=(Get-FileHash -LiteralPath $target).Hash
$active=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq (Join-Path $client 'AllyStudy.exe')})
if($Install -and $active.Count){throw 'Close the private Ally Study client before applying the embedded chat.'}
Add-Type -Path (Join-Path $root 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
$resolver=New-Object Mono.Cecil.DefaultAssemblyResolver
$resolver.AddSearchDirectory($client)
$reader=New-Object Mono.Cecil.ReaderParameters
$reader.AssemblyResolver=$resolver
$asm=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($source,$reader)
$module=$asm.MainModule
$type=$module.Types | Where-Object FullName -eq 'HeyClicky.App.Notch.Peek.NotchChatView'
if(!$type){throw 'Native chat type differs from the reviewed build.'}
$refs=@($module.GetMemberReferences())+@($module.Types | ForEach-Object {$_.Methods})
function Ref([string]$full){$found=@($refs | Where-Object FullName -eq $full);if($found.Count -ne 1){throw "Expected one member: $full"};return $found[0]}
function Reset-Body($method){$method.Body=New-Object Mono.Cecil.Cil.MethodBody($method);$method.Body.InitLocals=$true;$script:il=$method.Body.GetILProcessor()}
function Emit([string]$code,$operand=$null){
 $op=[Mono.Cecil.Cil.OpCodes]::$code
 if($null -eq $operand){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op));return}
 if($operand -is [Mono.Cecil.MethodReference]){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op,[Mono.Cecil.MethodReference]$operand));return}
 if($operand -is [Mono.Cecil.FieldReference]){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op,[Mono.Cecil.FieldReference]$operand));return}
 if($operand -is [Mono.Cecil.Cil.Instruction]){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op,[Mono.Cecil.Cil.Instruction]$operand));return}
 if($operand -is [double]){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op,[double]$operand));return}
 if($operand -is [string]){$script:il.Append([Mono.Cecil.Cil.Instruction]::Create($op,[string]$operand));return}
 throw "Unsupported IL operand: $operand"
}
$webCtor=Ref 'System.Void Microsoft.UI.Xaml.Controls.WebView2::.ctor()'
$webType=$webCtor.DeclaringType
$webDefinition=$webType.Resolve()
$sourceSetter=$module.ImportReference(($webDefinition.Methods | Where-Object Name -eq 'set_Source'))
$uiType=($module.GetTypeReferences() | Where-Object FullName -eq 'Microsoft.UI.Xaml.UIElement').Resolve()
$gotFocus=$module.ImportReference(($uiType.Methods | Where-Object Name -eq 'add_GotFocus'))
$lostFocus=$module.ImportReference(($uiType.Methods | Where-Object Name -eq 'add_LostFocus'))
$eventCtor=Ref 'System.Void Microsoft.UI.Xaml.RoutedEventHandler::.ctor(System.Object,System.IntPtr)'
$routedArgs=$module.GetTypeReferences() | Where-Object FullName -eq 'Microsoft.UI.Xaml.RoutedEventArgs'
$webField=$type.Fields | Where-Object Name -eq 'allyWebView'
if(!$webField){$webField=New-Object Mono.Cecil.FieldDefinition('allyWebView',[Mono.Cecil.FieldAttributes]::Private,$webType);$type.Fields.Add($webField)}
$focusField=$type.Fields | Where-Object Name -eq 'allyWebFocused'
if(!$focusField){$focusField=New-Object Mono.Cecil.FieldDefinition('allyWebFocused',[Mono.Cecil.FieldAttributes]::Private,$module.TypeSystem.Boolean);$type.Fields.Add($focusField)}
$presenter=$type.Fields | Where-Object Name -eq 'presenter'
$notchHostField=$type.Fields | Where-Object Name -eq 'host'
$presenterType=$module.Types | Where-Object FullName -eq $presenter.FieldType.FullName
if(!$presenterType){$presenterType=$presenter.FieldType.Resolve()}
$setKeyboard=$module.ImportReference(($presenterType.Methods | Where-Object Name -eq 'SetNotchChatComposerHasKeyboard'))
$setHeld=$module.ImportReference(($presenterType.Methods | Where-Object Name -eq 'SetNotchAgentPeekHeldOpen'))
foreach($entry in @(@('AllyGotFocus',$true),@('AllyLostFocus',$false))){
 $handler=$type.Methods | Where-Object Name -eq $entry[0]
 if(!$handler){
  $handler=New-Object Mono.Cecil.MethodDefinition($entry[0],[Mono.Cecil.MethodAttributes]::Private,$module.TypeSystem.Void)
  $handler.Parameters.Add((New-Object Mono.Cecil.ParameterDefinition($module.TypeSystem.Object)))
  $handler.Parameters.Add((New-Object Mono.Cecil.ParameterDefinition($routedArgs)))
  $type.Methods.Add($handler)
 }
 Reset-Body $handler
 $end=[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Ret)
 Emit Ldarg_0;Emit Ldfld $focusField;if($entry[1]){Emit Ldc_I4_1}else{Emit Ldc_I4_0};Emit Beq $end
 Emit Ldarg_0; if($entry[1]){Emit Ldc_I4_1}else{Emit Ldc_I4_0};Emit Stfld $focusField
 if($entry[1]){Emit Ldarg_0;Emit Ldfld $notchHostField;Emit Callvirt (Ref 'System.Void HeyClicky.App.Notch.INotchHost::RequestKeyboard()')}
 $afterSetters=[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Nop)
 Emit Ldarg_0;Emit Ldfld $presenter;Emit Brfalse $afterSetters
 foreach($setter in @($setKeyboard,$setHeld)){Emit Ldarg_0;Emit Ldfld $presenter;if($entry[1]){Emit Ldc_I4_1}else{Emit Ldc_I4_0};Emit Callvirt $setter}
 $script:il.Append($afterSetters)
 if(!$entry[1]){Emit Ldarg_0;Emit Ldfld $notchHostField;Emit Callvirt (Ref 'System.Void HeyClicky.App.Notch.INotchHost::ReleaseKeyboardIfUnheld()')}
 $script:il.Append($end)
}
$ctor=$type.Methods | Where-Object Name -eq '.ctor'
Reset-Body $ctor
Emit Ldarg_0;Emit Call (Ref 'System.Void Microsoft.UI.Xaml.Controls.Grid::.ctor()')
Emit Ldarg_0;Emit Ldarg_1;Emit Stfld $notchHostField
Emit Ldarg_0;Emit Ldarg_1;Emit Callvirt (Ref 'HeyClicky.App.Services.AppServices HeyClicky.App.Notch.INotchHost::get_Services()')
Emit Callvirt (Ref 'HeyClicky.INotchPresenter HeyClicky.App.Services.AppServices::get_Presenter()')
$script:il.Append([Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Isinst,[Mono.Cecil.TypeReference]$presenter.FieldType))
Emit Stfld $presenter
Emit Ldarg_0;Emit Ldc_R8 ([double]784);Emit Call (Ref 'System.Void Microsoft.UI.Xaml.FrameworkElement::set_Width(System.Double)')
Emit Ldarg_0;Emit Ldc_R8 ([double]600);Emit Call (Ref 'System.Void Microsoft.UI.Xaml.FrameworkElement::set_Height(System.Double)')
Emit Ldarg_0;Emit Newobj $webCtor;Emit Stfld $webField
foreach($pair in @(@($gotFocus,'AllyGotFocus'),@($lostFocus,'AllyLostFocus'))){
 Emit Ldarg_0;Emit Ldfld $webField;Emit Ldarg_0;Emit Ldftn ($type.Methods | Where-Object Name -eq $pair[1]);Emit Newobj $eventCtor;Emit Callvirt $pair[0]
}
Emit Ldarg_0;Emit Call (Ref 'Microsoft.UI.Xaml.Controls.UIElementCollection Microsoft.UI.Xaml.Controls.Panel::get_Children()')
Emit Ldarg_0;Emit Ldfld $webField;Emit Callvirt (Ref 'System.Void Microsoft.UI.Xaml.Controls.UIElementCollection::Add(Microsoft.UI.Xaml.UIElement)')
Emit Ldarg_0;Emit Ldfld $webField;Emit Ldstr 'ALLY_NOTCH_URL'
Emit Call (Ref 'System.String System.Environment::GetEnvironmentVariable(System.String)')
$makeUri=[Mono.Cecil.Cil.Instruction]::Create([Mono.Cecil.Cil.OpCodes]::Newobj,[Mono.Cecil.MethodReference](Ref 'System.Void System.Uri::.ctor(System.String)'))
Emit Dup;Emit Brtrue $makeUri;Emit Pop;Emit Ldstr 'http://127.0.0.1:18783/notch/'
$script:il.Append($makeUri);Emit Callvirt $sourceSetter;Emit Ret
foreach($name in @('Shown','Attach','Detach','Detached','SetDropTargeting')){
 $method=$type.Methods | Where-Object Name -eq $name
 Reset-Body $method
 if($name -in @('Detach','Detached')){Emit Ldarg_0;Emit Ldnull;Emit Ldnull;Emit Call ($type.Methods | Where-Object Name -eq 'AllyLostFocus')}
 Emit Ret
}
Reset-Body ($type.Methods | Where-Object Name -eq 'get_ComposerHoldsKeyboard')
Emit Ldarg_0;Emit Ldfld $focusField;Emit Ret
$layout=$module.Types | Where-Object Name -eq 'NotchPeekLayout'
Reset-Body ($layout.Methods | Where-Object Name -eq 'get_ChatBodyFrameHeight');Emit Ldc_R8 ([double]600);Emit Ret
Reset-Body ($layout.Methods | Where-Object Name -eq 'get_ChatPanelHeight');Emit Ldc_R8 ([double]638);Emit Ret
$size=$layout.Methods | Where-Object Name -eq 'PanelSize'
$chatHeightCall=@($size.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.Name -eq 'get_ChatPanelHeight'})
if($chatHeightCall.Count -ne 1){throw 'Chat panel layout differs from the reviewed build.'}
$width=$size.Body.Instructions[$size.Body.Instructions.IndexOf($chatHeightCall[0])-1]
if($width.OpCode.Code -notin @('Ldloc_0','Ldc_R8')){throw 'Unexpected chat panel width instruction.'}
$width.OpCode=[Mono.Cecil.Cil.OpCodes]::Ldc_R8;$width.Operand=[double]820
$module.Attributes=$module.Attributes -bor [Mono.Cecil.ModuleAttributes]::ILOnly
$asm.Write($ready);$asm.Dispose()
$verify=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($ready,$reader)
$verified=$verify.MainModule.Types | Where-Object Name -eq 'NotchChatView'
$verifiedCtor=$verified.Methods | Where-Object Name -eq '.ctor'
if(!($verifiedCtor.Body.Instructions.Operand -contains 'ALLY_NOTCH_URL')){throw 'Embedded chat URL was not serialized.'}
if(!@($verifiedCtor.Body.Instructions | Where-Object {$_.Operand -is [Mono.Cecil.MethodReference] -and $_.Operand.FullName -eq $sourceSetter.FullName}).Count){throw 'WebView navigation was not serialized.'}
$verify.Dispose()
if($Install){
 $backup=Join-Path $root 'branding-backup\HeyClicky.before-notch.dll'
 New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
 if(!(Test-Path -LiteralPath $backup)){Copy-Item -LiteralPath $target -Destination $backup}
 Move-Item -LiteralPath $ready -Destination $target -Force
}
if((Get-FileHash -LiteralPath $installedSource).Hash -ne $sourceHash){throw 'Installed source changed unexpectedly.'}
if(!$Install -and (Get-FileHash -LiteralPath $target).Hash -ne $privateHash){throw 'Live private assembly changed unexpectedly.'}
@{embeddedWebView=$true;reusesNativeChatTab=$true;cursorPatchIncluded=($source.EndsWith('.display-ready'));installed=[bool]$Install;nativeLaunchPerformed=$false;installedSourceUnchanged=$true;pendingClientClose=($active.Count -gt 0)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'ally-notch-verification.json')
Write-Output $(if($Install){'Embedded Ally chat installed.'}else{'Embedded Ally chat staged; live client unchanged.'})
