#!/usr/bin/env bash
# Programa deploy/backup.sh todos los días a las 03:30.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
line="30 3 * * * bash $root/deploy/backup.sh >> $root/backups/backup.log 2>&1"
mkdir -p "$root/backups"
( crontab -l 2>/dev/null | grep -vF "$root/deploy/backup.sh"; echo "$line" ) | crontab -
echo "Cron instalado: $line"
