param([string]$Root=$PSScriptRoot)
$ErrorActionPreference='Stop'
$client=Join-Path $Root 'client'
$target=Join-Path $client 'HeyClicky.dll'
$installed=Join-Path $env:LOCALAPPDATA 'HeyClickyApp\current\HeyClicky.dll'
if(@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq (Join-Path $client 'AllyStudy.exe')}).Count){
 throw 'Close the private client before updating its display text.'
}
$installedHash=(Get-FileHash -LiteralPath $installed).Hash
Add-Type -Path (Join-Path $Root 'tools\mono.cecil\lib\netstandard2.0\Mono.Cecil.dll')
$resolver=New-Object Mono.Cecil.DefaultAssemblyResolver
$resolver.AddSearchDirectory($client)
$reader=New-Object Mono.Cecil.ReaderParameters
$reader.AssemblyResolver=$resolver
function Get-AllyBrandTypes($items){foreach($item in $items){$item;Get-AllyBrandTypes $item.NestedTypes}}
function Get-AllyResourceHashes($module){
 $sha=[Security.Cryptography.SHA256]::Create()
 try {
  @(foreach($resource in $module.Resources){
   if($resource -is [Mono.Cecil.EmbeddedResource]){
    $resource.Name+':'+[BitConverter]::ToString($sha.ComputeHash($resource.GetResourceData()))
   }else{$resource.Name+':'+$resource.ResourceType.ToString()}
  }) | Sort-Object
 }finally{$sha.Dispose()}
}
$manifest=Get-Content -LiteralPath (Join-Path $Root 'ally-brand-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$asm=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($target,$reader)
$types=@(Get-AllyBrandTypes $asm.MainModule.Types)
$identity=$asm.Name.FullName
$typeNames=@($types | ForEach-Object FullName | Sort-Object)
$references=@($asm.MainModule.AssemblyReferences | ForEach-Object FullName | Sort-Object)
$resources=@(Get-AllyResourceHashes $asm.MainModule)
$entryPoint=$asm.MainModule.EntryPoint.FullName
$changed=0
foreach($row in $manifest){
 $type=$types | Where-Object FullName -eq $row.type
 $matches=@(foreach($method in $type.Methods){
  if($method.Name -ne $row.method -or !$method.HasBody){continue}
  foreach($i in $method.Body.Instructions){
   if($i.Offset -eq $row.offset -and $i.OpCode.Code -eq 'Ldstr' -and ($i.Operand -ceq $row.text -or $i.Operand -ceq $row.replacement)){$i}
  }
 })
 if($matches.Count -lt 1){throw "Display manifest no longer matches $($row.type)::$($row.method) at $($row.offset): $($row.text). No assembly replaced."}
 foreach($match in $matches){if($match.Operand -cne $row.replacement){$match.Operand=$row.replacement;$changed++}}
}
if($changed){
 $asm.MainModule.Attributes=$asm.MainModule.Attributes -bor [Mono.Cecil.ModuleAttributes]::ILOnly
 $staged=$target+'.ally-staged'
 $asm.Write($staged)
 $asm.Dispose()
 $verified=[Mono.Cecil.AssemblyDefinition]::ReadAssembly($staged,$reader)
 $verifiedTypes=@(Get-AllyBrandTypes $verified.MainModule.Types)
 if($verified.Name.FullName -ne $identity -or $verified.MainModule.EntryPoint.FullName -ne $entryPoint){throw 'Assembly identity or entry point changed.'}
 if(Compare-Object $typeNames @($verifiedTypes | ForEach-Object FullName | Sort-Object)){throw 'Type names changed.'}
 if(Compare-Object $references @($verified.MainModule.AssemblyReferences | ForEach-Object FullName | Sort-Object)){throw 'Assembly references changed.'}
 if(Compare-Object $resources @(Get-AllyResourceHashes $verified.MainModule)){throw 'Embedded resources changed.'}
 foreach($row in $manifest){
  $type=$verifiedTypes | Where-Object FullName -eq $row.type
  $found=@(foreach($method in $type.Methods){
   if($method.Name -ne $row.method -or !$method.HasBody){continue}
   $method.Body.Instructions | Where-Object {$_.Offset -eq $row.offset -and $_.OpCode.Code -eq 'Ldstr' -and $_.Operand -ceq $row.replacement}
  })
  if($found.Count -lt 1){throw 'Display text did not survive assembly serialization.'}
 }
 $verified.Dispose()
 $backupDirectory=Join-Path $Root 'branding-backup'
 New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
 $backup=Join-Path $backupDirectory 'HeyClicky.dll'
 if(!(Test-Path -LiteralPath $backup)){Copy-Item -LiteralPath $target -Destination $backup}
 # Replacing the directory entry detaches the shared hardlink; never write
 # through the existing linked file into the installed application.
 Move-Item -LiteralPath $staged -Destination $target -Force
}else{$asm.Dispose()}
if((Get-FileHash -LiteralPath $installed).Hash -ne $installedHash){throw 'Installed assembly hash changed unexpectedly.'}
# Give the standalone setup page private storage before changing its copy.
$setup=Join-Path $client 'ClickyBrowserSetup.html'
$installedSetup=Join-Path $env:LOCALAPPDATA 'HeyClickyApp\current\ClickyBrowserSetup.html'
$installedSetupHash=(Get-FileHash -LiteralPath $installedSetup).Hash
$setupText=[IO.File]::ReadAllText($setup)
$brandedSetup=$setupText.Replace('HeyClicky','Ally')
if($brandedSetup -cne $setupText){
 $setupStaged=$setup+'.ally-staged'
 [IO.File]::WriteAllText($setupStaged,$brandedSetup,(New-Object Text.UTF8Encoding($false)))
 Move-Item -LiteralPath $setupStaged -Destination $setup -Force
}
if((Get-FileHash -LiteralPath $installedSetup).Hash -ne $installedSetupHash){throw 'Installed setup page changed unexpectedly.'}
$receipt=@{displayLabels=$manifest.Count;labelsChangedThisRun=$changed;assemblyIdentityPreserved=$true;typeNamesPreserved=$true;assemblyReferencesPreserved=$true;embeddedResourcesPreserved=$true;installedAssemblyUnchanged=$true;nativeLaunchPerformed=$false;privateAssemblyHash=(Get-FileHash -LiteralPath $target).Hash}
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Root 'ally-brand-verification.json')
$receipt | ConvertTo-Json
