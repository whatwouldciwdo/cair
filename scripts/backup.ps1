param([string]$OutputDirectory = ".\backups")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$databaseFile = Join-Path $OutputDirectory "database-$stamp.dump"
$artifactFile = Join-Path $OutputDirectory "artifacts-$stamp.zip"
pg_dump --format=custom --no-owner --file=$databaseFile $env:DATABASE_URL
if ($LASTEXITCODE -ne 0) { throw "pg_dump gagal" }
$artifactRoot = if ($env:ARTIFACT_STORAGE_DIR) { $env:ARTIFACT_STORAGE_DIR } else { ".\storage\artifacts" }
if (Test-Path $artifactRoot) { Compress-Archive -Path "$artifactRoot\*" -DestinationPath $artifactFile -Force }
Write-Host "Backup selesai: $databaseFile dan $artifactFile"