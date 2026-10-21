# Local equivalent of the GitHub Actions job:
#   pnpm install --frozen-lockfile && pnpm test
# DSH ships its own Node/pnpm, which are not on PATH by default, so this
# script wires them in before running the same two commands.
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$deps = 'E:\dsh\resources\runtime\primary-runtime\dependencies'
$node = Join-Path $deps 'node\bin\node.exe'
$pnpm = Join-Path $deps 'pnpm\bin\pnpm.cjs'

if (-not (Test-Path $node)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
}
if (-not $node) {
  throw 'node not found: set PATH or adjust $deps in scripts/ci.ps1'
}
if (-not (Test-Path $pnpm)) {
  $pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
}
if (-not $pnpm) {
  throw 'pnpm not found: set PATH or adjust $deps in scripts/ci.ps1'
}

$env:PATH = (Split-Path $node) + ';' + $env:PATH

Push-Location $repo
try {
  & $node $pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with $LASTEXITCODE" }

  & $node $pnpm test
  if ($LASTEXITCODE -ne 0) { throw "pnpm test failed with $LASTEXITCODE" }
} finally {
  Pop-Location
}
