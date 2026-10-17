param([string]$Config = (Join-Path $env:APPDATA 'glass-pip-chat\watch-bridge.json'))
$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run speech-service/setup.ps1 first.' }
& $python (Join-Path $PSScriptRoot 'transcriber.py') --config $Config
exit $LASTEXITCODE
