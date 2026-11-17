param([string]$PythonPath, [switch]$InstallSkills)
$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $PythonPath) {
    $BundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path -LiteralPath $BundledPython) { $PythonPath = $BundledPython }
    else { $PythonPath = (Get-Command python -ErrorAction Stop).Source }
}
$DependencyLock = Get-Content -Raw -LiteralPath (Join-Path $ProjectRoot 'dependencies.lock.json') | ConvertFrom-Json
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git 未安装或不在 PATH 中' }
if (-not (Get-Command pnpm.cmd -ErrorAction SilentlyContinue)) {
    throw 'pnpm 未安装：请先安装 Node 22+ 与 pnpm（例如 npm i -g pnpm），再重新运行 setup.ps1'
}
foreach ($DependencyName in @('understand','experts')) {
    $Dependency = $DependencyLock.$DependencyName
    $DirectoryName = if ($DependencyName -eq 'understand') { 'understand-anything' } else { 'claude-skills' }
    $DependencyDirectory = Join-Path $ProjectRoot "vendor\$DirectoryName"
    if (-not (Test-Path -LiteralPath $DependencyDirectory)) {
        git clone --filter=blob:none --no-checkout $Dependency.repo $DependencyDirectory
        if ($LASTEXITCODE -ne 0) { throw "Cannot clone $DependencyName" }
        git -C $DependencyDirectory checkout --detach $Dependency.commit
        if ($LASTEXITCODE -ne 0) { throw "Cannot check out $DependencyName" }
    }
    $ActualCommit = git -C $DependencyDirectory rev-parse HEAD
    if ($ActualCommit -ne $Dependency.commit) { throw "Unexpected $DependencyName version; refusing to overwrite" }
}
$VenvPython = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $VenvPython)) {
    & $PythonPath -m venv (Join-Path $ProjectRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create Python environment' }
}
Push-Location (Join-Path $ProjectRoot 'vendor\understand-anything')
try {
    pnpm.cmd install --frozen-lockfile --filter '@understand-anything/core...' --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Cannot install Understand dependencies' }
    pnpm.cmd --filter '@understand-anything/core' build
    if ($LASTEXITCODE -ne 0) { throw 'Cannot build Understand core' }
} finally { Pop-Location }
if ($InstallSkills) {
    & $VenvPython (Join-Path $PSScriptRoot 'install_skills.py')
    if ($LASTEXITCODE -ne 0) { throw 'Skill installation failed' }
}
$UnderstandCore = Join-Path $ProjectRoot 'vendor\understand-anything\understand-anything-plugin\packages\core\dist\index.js'
if (-not (Test-Path -LiteralPath $UnderstandCore)) {
    throw "Understand core 未构建：$UnderstandCore 不存在。请确认 pnpm 可用（pnpm --version），并检查上面的安装/构建输出。"
}
Write-Output 'Setup complete. Run scripts\pa.ps1 doctor --network next.'
