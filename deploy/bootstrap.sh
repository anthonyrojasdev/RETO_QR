#!/usr/bin/env bash
# Prepara un VPS Ubuntu/Debian limpio: Docker, firewall y el repositorio en ~/reto-qr.
# Ejecutar como root:  bash bootstrap.sh https://github.com/anthonyrojasdev/RETO_QR.git
set -euo pipefail

REPO_URL="${1:?Uso: bootstrap.sh <url-del-repositorio>}"
TARGET="${TARGET:-$HOME/reto-qr}"

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# Firewall: solo SSH y web. (Docker se salta ufw con puertos publicados, pero el compose de
# producción solo publica 80/443.)
if command -v ufw >/dev/null || apt-get install -y ufw; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

if [ -d "$TARGET/.git" ]; then
  git -C "$TARGET" pull --ff-only
else
  git clone "$REPO_URL" "$TARGET"
fi

cat <<MSG

Listo. Siguientes pasos:
  cd $TARGET
  cp .env.prod.example .env && nano .env          # cambia todos los secretos
  # Solo si los paquetes de GHCR son privados:
  #   echo <TOKEN read:packages> | docker login ghcr.io -u <usuario> --password-stdin
  docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --wait
  bash deploy/install-backup-cron.sh               # copias diarias de PostgreSQL
MSG
