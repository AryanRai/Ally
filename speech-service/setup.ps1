param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$speechRoot = $PSScriptRoot
$venvPython = Join-Path $speechRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    & $Python -m venv (Join-Path $speechRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated Python environment. Use Python 3.10 or newer.' }
}
& $venvPython -m pip install -r (Join-Path $speechRoot 'requirements-local.txt')
if ($LASTEXITCODE -ne 0) { throw 'Speech dependencies did not install.' }
Write-Host 'Local speech runtime installed. In Ally, choose Voice > Connect. The first connection downloads the model.'
