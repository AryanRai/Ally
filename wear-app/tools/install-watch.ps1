param(
    [Parameter(Mandatory=$true)][string]$Device,
    [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    [string]$AllyData = "$env:APPDATA\glass-pip-chat"
)
$ErrorActionPreference = 'Stop'
$wearRoot = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $wearRoot 'app\build\outputs\apk\debug\app-debug.apk'
$config = Get-Content -LiteralPath (Join-Path $AllyData 'watch-bridge.json') -Raw | ConvertFrom-Json
if (-not $config.enabled) { throw 'Enable the Ally watch bridge first (see README).' }
& $Adb -s $Device install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'Watch installation failed' }
& $Adb -s $Device reverse "tcp:$($config.port)" "tcp:$($config.port)"
if ($LASTEXITCODE -ne 0) { throw 'ADB reverse failed' }
$serial = (& $Adb -s $Device shell getprop ro.serialno).Trim()
if ($LASTEXITCODE -ne 0 -or -not $serial) { throw 'Could not identify the paired watch' }
$config | Add-Member -NotePropertyName transport -NotePropertyValue @{serial=$serial; endpoint=$Device; adbPath=$Adb} -Force
[System.IO.File]::WriteAllText((Join-Path $AllyData 'watch-bridge.json'), ($config | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
# Only the debug app accepts these provisioning extras. Never bake tokens into an APK.
& $Adb -s $Device shell am start -S -n dev.ally.watch/.MainActivity --es endpoint "http://127.0.0.1:$($config.port)" --es token $config.token | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Watch launch failed' }
Write-Host 'Installed. Restart Ally to enable automatic reconnection for this watch.'
