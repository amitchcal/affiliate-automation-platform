#!/usr/bin/env bash
# Applies the schema, the seed, and every later migration to a scratch database,
# then runs the verify files. Every verify row should read "ok".
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
echo "--- later migrations; 0005 and 0006 twice (must be repeatable) ---"
$PSQL -d "$DB" -f supabase/migrations/0003_site.sql
$PSQL -d "$DB" -f supabase/migrations/0004_results.sql
$PSQL -d "$DB" -f supabase/migrations/0005_modules_and_test_brands.sql
$PSQL -d "$DB" -f supabase/migrations/0005_modules_and_test_brands.sql
$PSQL -d "$DB" -f supabase/migrations/0006_client_consistency.sql
$PSQL -d "$DB" -f supabase/migrations/0006_client_consistency.sql
for f in verify verify_site verify_results verify_modules verify_consistency; do
  echo "--- $f.sql ---"
  psql -d "$DB" -A -F ' | ' -t -f "supabase/$f.sql"
done
