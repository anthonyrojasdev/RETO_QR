#!/bin/sh
# Se ejecuta una sola vez, al crear el volumen de PostgreSQL.
# Crea una base de datos y un usuario por servicio (cada servicio es dueño de sus datos):
#   - auth: usuarios de la Auth API (contraseñas con bcrypt)
#   - qr:   historial de factorizaciones de la QR API
set -eu

: "${AUTH_DB_PASSWORD:?AUTH_DB_PASSWORD es obligatorio}"
: "${QR_DB_PASSWORD:?QR_DB_PASSWORD es obligatorio}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v auth_password="$AUTH_DB_PASSWORD" -v qr_password="$QR_DB_PASSWORD" <<'EOSQL'
CREATE USER auth_app WITH PASSWORD :'auth_password';
CREATE DATABASE auth OWNER auth_app;
REVOKE ALL ON DATABASE auth FROM PUBLIC;

CREATE USER qr_app WITH PASSWORD :'qr_password';
CREATE DATABASE qr OWNER qr_app;
REVOKE ALL ON DATABASE qr FROM PUBLIC;
EOSQL
