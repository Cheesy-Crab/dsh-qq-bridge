param(
  [string]$Version = (Get-Content (Join-Path (Split-Path -Parent $PSScriptRoot) 'package.json') -Raw | ConvertFrom-Json).version
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $project 'dist'
$stage = Join-Path $dist "dsh-qq-bridge-$Version"
$zip = Join-Path $dist "dsh-qq-bridge-$Version.zip"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$items = @(
  'src', 'lib', 'docs', 'scripts', 'systemd', 'test',
  'README.md', 'CHANGELOG.md', 'TODO.md', 'PLAN.md',
  'package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', '.gitattributes', '.gitignore'
)
foreach ($item in $items) {
  $source = Join-Path $project $item
  if (Test-Path $source) {
    Copy-Item $source (Join-Path $stage $item) -Recurse -Force
  }
}

$napcat = Join-Path $project 'vendor\napcat'
if (Test-Path (Join-Path $napcat 'napcat.bat')) {
  Write-Host "including vendor/napcat (this can take a while)"
  Copy-Item $napcat (Join-Path $stage 'vendor\napcat') -Recurse -Force
  Copy-Item (Join-Path $project 'vendor\README.md') (Join-Path $stage 'vendor\README.md') -Force
} else {
  Write-Warning "vendor/napcat/napcat.bat not found; bundle will not include NapCat"
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $stage -Recurse -Force
$size = (Get-Item $zip).Length / 1MB
Write-Host ("bundle: {0} ({1:N1} MB)" -f $zip, $size)
