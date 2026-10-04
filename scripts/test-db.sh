#!/usr/bin/env bash
# Runs the schema and the access-rule tests against a scratch local database.
# Requires a local PostgreSQL and a superuser able to create databases.
set -euo pipefail
DB="${TEST_DB:-map_test}"
PSQL="${PSQL:-psql -v ON_ERROR_STOP=1 -q}"
dropdb --if-exists "$DB"
createdb "$DB"
$PSQL -d "$DB" -f supabase/tests/local_bootstrap.sql
$PSQL -d "$DB" -f supabase/migrations/0001_core.sql
$PSQL -d "$DB" -f supabase/tests/local_grants.sql
$PSQL -d "$DB" -f supabase/tests/access_rules.sql
