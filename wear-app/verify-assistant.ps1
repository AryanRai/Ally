param(
  [Parameter(Mandatory=$true)][string]$Serial,
  [Parameter(Mandatory=$true)][ValidateSet('dev.ally.phone','dev.ally.watch')][string]$Package,
  [switch]$Repair
)
$ErrorActionPreference='Stop'
$adbTool=Join-Path $env:LOCALAPPDATA 'Android/Sdk/platform-tools/adb.exe'
$component="$Package/dev.ally.device.AllyAssistantService"
$selected=(& $adbTool -s $Serial shell settings get secure voice_interaction_service).Trim()
if($LASTEXITCODE -ne 0) { throw 'Android device is not connected.' }
if($selected -ne $component) { throw 'Ally is not the selected assistant. Choose it in Android settings; this check preserves that choice.' }
function Bound {
  $dump=(& $adbTool -s $Serial shell dumpsys voiceinteraction) -join "`n"
  return $LASTEXITCODE -eq 0 -and $dump.Contains("mComponent=$component") -and $dump.Contains('mBound=true')
}
if(!(Bound)) {
  if(!$Repair) { throw 'Ally is selected but Android has no bound assistant. Run with -Repair to rebind this same component.' }
  # Package replacement can leave secure settings intact with no active implementation.
  # Rebind the existing selection, restoring it even if the transient clear fails.
  try {
    & $adbTool -s $Serial shell "settings put secure voice_interaction_service ''"
    if($LASTEXITCODE -ne 0) { throw 'Android refused the assistant rebind.' }
    Start-Sleep -Milliseconds 300
  } finally {
    & $adbTool -s $Serial shell settings put secure voice_interaction_service $selected
    if($LASTEXITCODE -ne 0) { throw 'Restore the selected assistant in Android settings.' }
  }
  for($attempt=0;$attempt -lt 10 -and !(Bound);$attempt++) { Start-Sleep -Milliseconds 300 }
  if(!(Bound)) { throw 'Android has not rebound the selected assistant. Reselect Ally in Android settings.' }
}
Write-Output "Ally assistant selected and bound on $Package. No audio capture or role change."
