#!/bin/sh
# Genera la configuración declarativa de Kong a partir de la plantilla,
# sustituyendo los valores que llegan por variables de entorno, y arranca
# Kong con el entrypoint oficial de la imagen.
set -eu

: "${JWT_SECRET:?JWT_SECRET es obligatorio}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD es obligatorio}"
: "${CORS_ORIGIN:?CORS_ORIGIN es obligatorio}"

# Los valores se insertan con sed, así que se restringen a caracteres seguros.
for name in JWT_SECRET REDIS_PASSWORD; do
  eval "value=\$$name"
  case "$value" in
    *[!A-Za-z0-9_-]*) echo "$name solo puede contener letras, números, '-' y '_'" >&2; exit 1 ;;
  esac
done
if [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "JWT_SECRET debe tener al menos 32 caracteres" >&2
  exit 1
fi
case "$CORS_ORIGIN" in
  http://*|https://*) ;;
  *) echo "CORS_ORIGIN debe empezar con http:// o https://" >&2; exit 1 ;;
esac
case "$CORS_ORIGIN" in
  *[\|\&\\\"\ ]*) echo "CORS_ORIGIN contiene caracteres no permitidos" >&2; exit 1 ;;
esac

sed -e "s|__JWT_SECRET__|${JWT_SECRET}|g" \
    -e "s|__REDIS_PASSWORD__|${REDIS_PASSWORD}|g" \
    -e "s|__CORS_ORIGIN__|${CORS_ORIGIN}|g" \
    /kong/kong.template.yml > /tmp/kong.yml

exec /docker-entrypoint.sh kong docker-start
