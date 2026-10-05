#!/usr/bin/env bash
# Runs the schema and the database tests against scratch local databases.
# Requires a local PostgreSQL and a superuser able to create databases.
set -euo pipefail
PSQL="${PSQL:-psql -v ON_ERROR_STOP=1 -q}"

run_suite() {
  local db="$1" test_file="$2"
  dropdb --if-exists "$db"
  createdb "$db"
  $PSQL -d "$db" -c "create extension if not exists pgcrypto" >/dev/null
  $PSQL -d "$db" -f supabase/tests/local_bootstrap.sql >/dev/null
  $PSQL -d "$db" -f supabase/migrations/0001_core.sql >/dev/null
  $PSQL -d "$db" -f supabase/migrations/0003_site.sql >/dev/null
  $PSQL -d "$db" -f supabase/tests/local_grants.sql >/dev/null
  $PSQL -d "$db" -f "$test_file" | grep -v "^ *$" | grep -E "PASSED|ERROR" || true
}

run_suite map_test_access supabase/tests/access_rules.sql
run_suite map_test_site supabase/tests/site_rules.sql
