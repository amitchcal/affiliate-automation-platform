#!/usr/bin/env bash
# Applies the schema and the seed to a scratch database and runs verify.sql.
set -euo pipefail
DB="${TEST_DB:-map_seed_test}"
PSQL="${PSQL:-psql -v ON_ERROR_STOP=1 -q}"
dropdb --if-exists "$DB"; createdb "$DB"
$PSQL -d "$DB" -c "create extension if not exists pgcrypto"
$PSQL -d "$DB" -f supabase/tests/local_bootstrap.sql
$PSQL -d "$DB" -f supabase/migrations/0001_core.sql
echo "--- seed with no user (should fail with a clear message) ---"
$PSQL -d "$DB" -f supabase/migrations/0002_seed_first_client.sql 2>&1 | grep -o "No owner was created.*" || true
$PSQL -d "$DB" -c "insert into auth.users (email) values ('amit.chakraborty@affilyvault.com')"
echo "--- seed twice (must be repeatable) ---"
$PSQL -d "$DB" -f supabase/migrations/0002_seed_first_client.sql
$PSQL -d "$DB" -f supabase/migrations/0002_seed_first_client.sql
psql -d "$DB" -f supabase/verify.sql
