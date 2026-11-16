# One-command verification for the code-review plugin and the controller.
#
# Usage:
#   .\scripts\verify_all.ps1              # every layer (does not change project state)
#   .\scripts\verify_all.ps1 -SkipTests   # skip the slower unittest run
#
# Layers:
#   1. syntax/compile   compileall (Python) + node --check (Host/Client halves)
#   2. controller tests unittest discover (inspect + projects + existing suite)
#   3. host smoke       node scripts/verify_harness_plugin.mjs (fake ctx, 59 checks)
#   4. real read-only   project list / branches / knowledge status / review list
#   5. install state    profile bundle selection
# Visual verification still needs a human look at the Harness page (the web port
# requires a browser session); this script reports it as "manual" only.

param([switch]$SkipTests)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$python = Join-Path $root '.venv\Scripts\python.exe'
$results = New-Object System.Collections.ArrayList
$failures = 0

function Record($name, $code) {
    if ($code -eq 0) {
        [void]$results.Add([pscustomobject]@{ Step = $name; Result = 'PASS' })
    } else {
        [void]$results.Add([pscustomobject]@{ Step = $name; Result = "FAIL (exit $code)" })
        $script:failures = $script:failures + 1
    }
}

function Section($name) {
    Write-Host ''
    Write-Host "=== $name ===" -ForegroundColor Cyan
}

Section '1. compile and syntax'
& $python -m compileall -q project_assistant tests
Record 'python compileall' $LASTEXITCODE
node --check harness-plugin\index.js
Record 'node --check host half' $LASTEXITCODE
node --check harness-plugin\client.js
Record 'node --check client half' $LASTEXITCODE

if (-not $SkipTests) {
    Section '2. controller tests (unittest)'
    $log = Join-Path $env:TEMP ('recsdk-verify-' + [guid]::NewGuid().ToString('N') + '.log')
    & $python -m unittest discover -s tests 2>&1 | Tee-Object -FilePath $log | Select-Object -Last 4
    Record 'unittest discover' $LASTEXITCODE
}

Section '3. host half smoke test (59 checks)'
node scripts\verify_harness_plugin.mjs | Select-Object -Last 3
Record 'verify_harness_plugin.mjs' $LASTEXITCODE

Section '4. real controller read-only commands'
& $python -m project_assistant.cli project list | Out-Null
Record 'project list' $LASTEXITCODE
& $python -m project_assistant.cli project branches --id recsdk | Out-Null
Record 'project branches recsdk' $LASTEXITCODE
& $python -m project_assistant.cli knowledge status --id recsdk --ref develop | Out-Null
Record 'knowledge status recsdk/develop' $LASTEXITCODE
& $python -m project_assistant.cli knowledge status --id recsdk --ref refactor/develop | Out-Null
Record 'knowledge status recsdk/refactor/develop' $LASTEXITCODE
& $python -m project_assistant.cli --project recsdk review list | Out-Null
Record 'review list (live)' $LASTEXITCODE
& $python -m project_assistant.cli --project recsdk review list --offline | Out-Null
Record 'review list (offline)' $LASTEXITCODE

Section '5. model route (Harness bridge or manual) is usable'
$modelOutput = & $python -m project_assistant.cli model test --id recsdk 2>&1 | Out-String
$modelCode = $LASTEXITCODE
if ($modelCode -eq 0 -and $modelOutput -match '"ok": true') {
    Write-Host 'model self-check reached the configured endpoint'
    Record 'model self-check (reachable)' 0
} elseif ($modelCode -eq 0 -and $modelOutput -match '"skipped": true') {
    Write-Host 'model route not configured (page: use the Harness model to enable semantic work)'
    Record 'model self-check (not configured)' 0
} else {
    Write-Host $modelOutput
    Record 'model self-check' 1
}

Section '6. installed bundle'
$profilePath = Join-Path $env:USERPROFILE '.dsh\profiles\desktop\package.json'
$bundleCode = 1
if (Test-Path $profilePath) {
    $profileText = Get-Content $profilePath -Raw
    if ($profileText -match '@local/recsdk-review') {
        Write-Host 'profile selects @local/recsdk-review'
        $bundleCode = 0
    } else {
        Write-Host 'profile does not select the bundle'
    }
} else {
    Write-Host 'profile package.json not found'
}
Record 'installed bundle selection' $bundleCode

Write-Host ''
Write-Host '=== summary ===' -ForegroundColor Cyan
$results | Format-Table -AutoSize
Write-Host 'Manual step: refresh the Harness page, open "review code", then check projects -> import -> branch switch -> knowledge card -> PR list/detail.'
if ($failures -gt 0) {
    Write-Host "$failures step(s) failed" -ForegroundColor Red
    exit 1
}
Write-Host 'All automated layers passed' -ForegroundColor Green
exit 0
