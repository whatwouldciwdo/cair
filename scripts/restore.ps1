param([Parameter(Mandatory=$true)][string]$DatabaseDump, [string]$ArtifactZip)
$ErrorActionPreference = "Stop"
pg_restore --clean --if-exists --no-owner --dbname=$env:DATABASE_URL $DatabaseDump
if ($LASTEXITCODE -ne 0) { throw "pg_restore gagal" }
if ($ArtifactZip) {
  $artifactRoot = if ($env:ARTIFACT_STORAGE_DIR) { $env:ARTIFACT_STORAGE_DIR } else { ".\storage\artifacts" }
  New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
  Expand-Archive -Path $ArtifactZip -DestinationPath $artifactRoot -Force
}
Write-Host "Restore selesai. Jalankan pemeriksaan readiness dan smoke test."