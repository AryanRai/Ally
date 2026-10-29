$ErrorActionPreference='Stop'
$taskRoot=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$taskEnv=Join-Path $taskRoot '.local/manim/.venv'
if(!(Test-Path -LiteralPath (Join-Path $taskEnv 'Scripts/python.exe'))){
 & uv.exe venv --python 3.12 $taskEnv
 if($LASTEXITCODE -ne 0){throw 'Manim virtual environment setup failed.'}
}
& uv.exe pip install --python (Join-Path $taskEnv 'Scripts/python.exe') -r (Join-Path $PSScriptRoot 'requirements.txt')
if($LASTEXITCODE -ne 0){throw 'Manim package setup failed.'}
