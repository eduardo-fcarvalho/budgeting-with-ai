#!/bin/sh
# Executar com o cliente PostgreSQL da mesma versão do servidor, em host de confiança.
set -eu
umask 077
: "${PGDATABASE:?}" "${PGHOST:?}" "${PGUSER:?}" "${1:?Informe um arquivo novo para o backup}"
tmp=$(mktemp "${1}.XXXXXX")
trap 'rm -f "$tmp"' EXIT
pg_dump --format=custom --no-owner --no-acl --exclude-table-data=spring_session --exclude-table-data=spring_session_attributes --file="$tmp"
pg_restore --list "$tmp" >/dev/null
ln "$tmp" "$1"
