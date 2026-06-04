$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

npm install
npm install --prefix assessment
npm run build:windows

Write-Host ""
Write-Host "Windows build complete."
Write-Host "Output: $RootDir\release"
