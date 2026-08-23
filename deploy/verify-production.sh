#!/usr/bin/env bash
set -Eeuo pipefail
BASE_URL="${BASE_URL:-http://10.8.140.67}"
mkdir -p evidence
curl -fsS "$BASE_URL/api/health/live" | tee evidence/live.json
curl -fsS "$BASE_URL/api/health/ready" | tee evidence/ready.json
curl -fsSI "$BASE_URL/login" | tee evidence/login-headers.txt
docker compose --env-file .env.production -f docker-compose.production.yml ps > evidence/compose-ps.txt
docker compose --env-file .env.production -f docker-compose.production.yml logs --since=10m --no-color > evidence/recent-logs.txt
! grep -Eiq "panic|unhandled|fatal" evidence/recent-logs.txt
echo "Verifikasi teknis production berhasil. UAT bisnis tetap memerlukan tanda tangan pemilik layanan."