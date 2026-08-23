#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
test -f .env.production || { echo "deploy/.env.production belum ada" >&2; exit 1; }
chmod 600 .env.production
mkdir -p backups evidence
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
grep -Eq '^POSTGRES_PASSWORD=.{24,}$' .env.production || { echo "POSTGRES_PASSWORD minimal 24 karakter" >&2; exit 1; }
grep -Eq '^AUTH_SECRET=.{32,}$' .env.production || { echo "AUTH_SECRET minimal 32 karakter" >&2; exit 1; }
grep -Eq '^METRICS_TOKEN=.{32,}$' .env.production || { echo "METRICS_TOKEN minimal 32 karakter" >&2; exit 1; }
docker compose --env-file .env.production -f docker-compose.production.yml build --pull
docker compose --env-file .env.production -f docker-compose.production.yml up -d --remove-orphans
for i in {1..60}; do curl -fsS http://127.0.0.1:3006/api/health/ready && break; sleep 5; done
curl -fsS http://127.0.0.1:3006/api/health/ready | tee "evidence/ready-$(date +%Y%m%d-%H%M%S).json"
docker compose --env-file .env.production -f docker-compose.production.yml ps