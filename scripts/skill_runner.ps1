param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$Installation = Get-Content -Raw -LiteralPath (Join-Path $SkillRoot 'installation.json') | ConvertFrom-Json
$ProjectRoot = $Installation.project_root
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'project_assistant\cli.py'))) { throw 'Shared engine is missing. Restore the project-assistant installation.' }
& (Join-Path $ProjectRoot 'scripts\pa.ps1') @Arguments
exit $LASTEXITCODE
