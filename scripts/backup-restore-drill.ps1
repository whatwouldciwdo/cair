param([string]$SourceUrl = $env:DATABASE_URL, [string]$DrillUrl = $env:DRILL_DATABASE_URL)
$ErrorActionPreference = "Stop"
if (!$SourceUrl -or !$DrillUrl) { throw "DATABASE_URL dan DRILL_DATABASE_URL wajib diisi; DB drill harus terpisah" }
if ($SourceUrl -eq $DrillUrl) { throw "DRILL_DATABASE_URL tidak boleh sama dengan DATABASE_URL" }
$dump = Join-Path $env:TEMP "pltgu-drill-$([guid]::NewGuid()).dump"
try {
  pg_dump --format=custom --no-owner --file=$dump $SourceUrl
  if ($LASTEXITCODE -ne 0) { throw "pg_dump gagal" }
  pg_restore --clean --if-exists --no-owner --dbname=$DrillUrl $dump
  if ($LASTEXITCODE -ne 0) { throw "pg_restore gagal" }
  $count = psql $DrillUrl -tAc 'SELECT COUNT(*) FROM "_prisma_migrations";'
  if ($LASTEXITCODE -ne 0 -or [int]$count -lt 1) { throw "Verifikasi restore gagal" }
  Write-Host "Backup/restore drill berhasil; $count migrasi ditemukan di DB terpisah."
} finally { Remove-Item $dump -Force -ErrorAction SilentlyContinue }