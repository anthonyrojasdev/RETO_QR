#!/usr/bin/env bash
# Copia de las bases auth y qr de PostgreSQL en ./backups (conserva los últimos 7 días).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M%S)
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  pg_dumpall -U postgres | gzip > "backups/pg-$stamp.sql.gz"
find backups -name 'pg-*.sql.gz' -mtime +7 -delete
echo "Backup: backups/pg-$stamp.sql.gz"
