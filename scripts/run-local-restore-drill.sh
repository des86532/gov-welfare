#!/usr/bin/env bash
set -euo pipefail

drill_dir=$(mktemp -d "${TMPDIR:-/tmp}/gov-welfare-restore.XXXXXX")
pg_bin="${RESTORE_DRILL_PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
pg_port="${RESTORE_DRILL_PORT:-55440}"
pg_started=0

cleanup() {
  if [ "$pg_started" -eq 1 ]; then "$pg_bin/pg_ctl" -D "$drill_dir/pgdata" -m fast -w stop >/dev/null 2>&1 || true; fi
  if [[ "$drill_dir" == *gov-welfare-restore.* ]]; then
    find "$drill_dir" -type f -exec truncate -s 0 {} \; 2>/dev/null || true
    find "$drill_dir" -depth -delete 2>/dev/null || true
  fi
}
trap cleanup EXIT

for command_path in "$pg_bin/initdb" "$pg_bin/pg_ctl" "$pg_bin/createdb" "$pg_bin/psql"; do
  [ -x "$command_path" ] || { echo "Missing PostgreSQL 17 executable: $command_path" >&2; exit 1; }
done
[ -f .env.local ] || { echo "Missing .env.local" >&2; exit 1; }
[ -f supabase/.temp/project-ref ] || { echo "Repository is not linked to a Supabase project" >&2; exit 1; }

mkdir -p "$drill_dir/socket"
chmod 700 "$drill_dir"
project_ref=$(tr -d '\n' < supabase/.temp/project-ref)
supabase projects api-keys --project-ref "$project_ref" --reveal --output json > "$drill_dir/keys.json"
service_key=$(jq -r '.[] | select(.id=="service_role") | .api_key // .key // .value // empty' "$drill_dir/keys.json")
[ -n "$service_key" ] || { echo "Unable to retrieve the linked project's service role key" >&2; exit 1; }
truncate -s 0 "$drill_dir/keys.json"

"$pg_bin/initdb" -D "$drill_dir/pgdata" --auth=trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$drill_dir/pgdata" -o "-k $drill_dir/socket -p $pg_port -h 127.0.0.1" -w start >/dev/null
pg_started=1
"$pg_bin/createdb" -h 127.0.0.1 -p "$pg_port" gov_welfare_restore
"$pg_bin/psql" -h 127.0.0.1 -p "$pg_port" -d gov_welfare_restore -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
SQL

for migration in supabase/migrations/*.sql; do
  "$pg_bin/psql" -h 127.0.0.1 -p "$pg_port" -d gov_welfare_restore -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

set -a
source .env.local
set +a
export SUPABASE_SERVICE_ROLE_KEY="$service_key"
RESTORE_DRILL_DATABASE_URL="postgresql://127.0.0.1:$pg_port/gov_welfare_restore" \
RESTORE_DRILL_BACKUP_PATH="$drill_dir/application-backup.json" \
PSQL_BIN="$pg_bin/psql" \
npm run restore:drill
printf 'backup_bytes=%s\n' "$(wc -c < "$drill_dir/application-backup.json")"
