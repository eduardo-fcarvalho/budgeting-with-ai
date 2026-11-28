#!/bin/bash
set -euo pipefail
case "$#:$*" in
    1:image|1:recovery) mode=$1 ;;
    *) echo 'Uso: bash scripts/test-pilot.sh image|recovery' >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."
export POSTGRES_PASSWORD=ci-only OPENAI_API_KEY= COOKIE_SECURE=false
override=$(mktemp)
compose() {
    docker compose -p "budgeting-ci-$$" -f compose.yml -f "$override" "$@"
}
cleanup() {
    status=$?
    compose down --volumes --remove-orphans --rmi local || {
        if [ "$status" -eq 0 ]; then status=1; fi
    }
    rm -f "$override"
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cat > "$override" <<'YAML'
services:
  app:
    ports: !override ["127.0.0.1::8080"]
YAML

compose up --detach --build --wait --wait-timeout 90
base_url="http://$(compose port app 8080)"
curl --fail --silent --show-error --output /dev/null --retry 40 --retry-all-errors \
    --retry-delay 1 --retry-max-time 60 --max-time 3 "$base_url/api/session"

pg() {
    local database=$1
    shift
    compose exec -T -e PGHOST=127.0.0.1 -e PGUSER=budgeting -e PGPASSWORD="$POSTGRES_PASSWORD" \
        -e PGDATABASE="$database" database "$@"
}

pg budgeting psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into account (id, email, password_hash) values
    ('10000000-0000-4000-8000-000000000001', 'a@example.test', '{bcrypt}$2b$10$T5h6P7HQWkRgsGpxRVKyeughNQn2pDY5VWv3ViDx3Qw03KY0EmNTm'),
    ('10000000-0000-4000-8000-000000000002', 'b@example.test', '{bcrypt}$2b$10$T5h6P7HQWkRgsGpxRVKyeughNQn2pDY5VWv3ViDx3Qw03KY0EmNTm');
SQL

if [ "$mode" = image ]; then
    (cd frontend && BUDGETING_IMAGE_URL="$base_url" npm run test:browser -- image.spec.mjs)
    exit
fi

pg budgeting psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into category (owner, name)
values ('10000000-0000-4000-8000-000000000001', 'Mercado');
insert into expense (owner, id, description, amount, date, category_key)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
        'Gasto fictício', 4290, '2026-11-23', 'mercado');
insert into spring_session values
    ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
     0, 0, 1209600, 9999999999999, '10000000-0000-4000-8000-000000000001');
insert into spring_session_attributes values
    ('30000000-0000-4000-8000-000000000001', 'fixture', '\x00');
insert into voice_budget (month, micro_usd)
values (date_trunc('month', now() at time zone 'UTC')::date, 500);
SQL

compose cp scripts/backup.sh database:/tmp/backup.sh
compose cp scripts/restore.sh database:/tmp/restore.sh
pg budgeting sh /tmp/backup.sh /tmp/piloto.dump
pg budgeting createdb budgeting_restored
pg budgeting_restored sh /tmp/restore.sh /tmp/piloto.dump

pg budgeting_restored psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
    if (select count(*) from account) <> 2 or not exists (
        select 1 from expense e join category c on c.owner=e.owner and c.normalized=e.category_key
        where e.owner='10000000-0000-4000-8000-000000000001'
              and e.amount=4290 and e.date='2026-11-23' and c.name='Mercado'
    ) then raise exception 'Dados do diário divergiram após restaurar'; end if;
    if exists (select 1 from spring_session) or exists (select 1 from spring_session_attributes)
    then raise exception 'A restauração recuperou sessões antigas'; end if;
    if (select micro_usd from voice_budget where month=date_trunc('month', now() at time zone 'UTC')::date)
       is distinct from 5000000
    then raise exception 'A voz ficou disponível após restaurar'; end if;
end $$;
SQL
echo 'Recuperação validada em PostgreSQL descartável.'
