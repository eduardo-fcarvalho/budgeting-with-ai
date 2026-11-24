#!/bin/sh
# PGDATABASE deve ser um banco vazio criado especialmente para a recuperação.
set -eu
: "${PGDATABASE:?}" "${PGHOST:?}" "${PGUSER:?}" "${1:?Informe o arquivo de backup}"
objects=$(psql -X -v ON_ERROR_STOP=1 -Atc "select count(*) from pg_class where relnamespace='public'::regnamespace")
[ "$objects" = 0 ] || { echo 'Escolha um banco vazio.' >&2; exit 1; }
exec pg_restore --dbname="$PGDATABASE" --no-owner --no-acl --exit-on-error --single-transaction "$1"
