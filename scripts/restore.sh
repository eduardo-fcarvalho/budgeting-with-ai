#!/bin/sh
# PGDATABASE deve ser um banco vazio criado especialmente para a recuperação.
set -eu
umask 077
: "${PGDATABASE:?}" "${PGHOST:?}" "${PGUSER:?}" "${1:?Informe o arquivo de backup}"
objects=$(psql -X -v ON_ERROR_STOP=1 -Atc "select count(*) from pg_class where relnamespace='public'::regnamespace")
[ "$objects" = 0 ] || { echo 'Escolha um banco vazio.' >&2; exit 1; }
sql=$(mktemp)
trap 'rm -f "$sql"' EXIT
pg_restore --no-owner --no-acl --exit-on-error --file="$sql" "$1"
# O backup pode anteceder chamadas cobradas. O diário manual fica disponível após a recuperação.
psql -X -q -v ON_ERROR_STOP=1 --single-transaction --file="$sql" --command="
    insert into public.voice_budget(month, micro_usd)
    values (date_trunc('month', now() at time zone 'UTC')::date, 5000000)
    on conflict (month) do update set micro_usd=excluded.micro_usd"
