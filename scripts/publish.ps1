# 提交并推送本仓库到 GitHub（发布新版本用）。
#
# 用法：
#   .\scripts\publish.ps1 -Message "描述本次改动"
#   .\scripts\publish.ps1 -Message "..." -SkipVerify   # 跳过 verify_all 自检
param(
    [Parameter(Mandatory = $true)][string]$Message,
    [switch]$SkipVerify
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $SkipVerify) {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify_all.ps1') -SkipTests
    if ($LASTEXITCODE -ne 0) { throw 'verify_all 未通过，已停止发布' }
}

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host '没有需要提交的变更'
    exit 0
}
git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw 'git commit 失败' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'git push 失败' }
Write-Host '已推送到 https://github.com/wupingL/dsh-project-review'
