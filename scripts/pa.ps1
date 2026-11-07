param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PythonRuntime = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $PythonRuntime)) {
    throw 'Run scripts\setup.ps1 first.'
}
Push-Location $ProjectRoot
try {
    & $PythonRuntime -m project_assistant.cli @Arguments
    exit $LASTEXITCODE
} finally { Pop-Location }
