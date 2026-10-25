param(
  [string]$Source = 'E:\NapCat\NapCat.Shell.Windows.Node',
  [string]$Destination = (Join-Path (Split-Path -Parent $PSScriptRoot) 'vendor\napcat')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $Source 'napcat.bat'))) {
  throw "未找到 $Source\napcat.bat；请用 -Source 指定 NapCat Shell 目录"
}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Write-Host "copying $Source -> $Destination"
robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
$files = Get-ChildItem $Destination -Recurse -File | Measure-Object Length -Sum
Write-Host ("done: {0} files, {1:N1} MB" -f $files.Count, ($files.Sum / 1MB))
