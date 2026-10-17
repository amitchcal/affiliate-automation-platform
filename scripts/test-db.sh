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
  $PSQL -d "$db" -f supabase/migrations/0004_results.sql >/dev/null
  # A second run proves 0004 is safe to apply twice.
  $PSQL -d "$db" -f supabase/migrations/0004_results.sql >/dev/null
  $PSQL -d "$db" -f supabase/migrations/0005_modules_and_test_brands.sql >/dev/null
  # A second run proves 0005 is safe to apply twice.
  $PSQL -d "$db" -f supabase/migrations/0005_modules_and_test_brands.sql >/dev/null
  $PSQL -d "$db" -f supabase/migrations/0006_client_consistency.sql >/dev/null
  # A second run proves 0006 is safe to apply twice.
  $PSQL -d "$db" -f supabase/migrations/0006_client_consistency.sql >/dev/null
  $PSQL -d "$db" -f supabase/migrations/0007_privacy_template_wording.sql >/dev/null
  # A second run proves 0007 is safe to apply twice.
  $PSQL -d "$db" -f supabase/migrations/0007_privacy_template_wording.sql >/dev/null
  $PSQL -d "$db" -f supabase/migrations/0008_invitations.sql >/dev/null
  # A second run proves 0008 is safe to apply twice.
  $PSQL -d "$db" -f supabase/migrations/0008_invitations.sql >/dev/null
  $PSQL -d "$db" -f supabase/tests/local_grants.sql >/dev/null
  # A failing test stops psql with an ERROR, so the suite's PASSED line never prints.
  local out
  if ! out=$($PSQL -d "$db" -f "$test_file" 2>&1); then
    echo "$out" | grep -E "ERROR|PASSED" || true
    echo "FAILED: $test_file"
    return 1
  fi
  echo "$out" | grep -E "PASSED"
}

run_suite map_test_access  supabase/tests/access_rules.sql
run_suite map_test_site    supabase/tests/site_rules.sql
run_suite map_test_results supabase/tests/results_rules.sql
run_suite map_test_consistency supabase/tests/consistency_rules.sql
run_suite map_test_modules supabase/tests/module_rules.sql
run_suite map_test_privacy supabase/tests/privacy_template_rules.sql
run_suite map_test_invitations supabase/tests/invitation_rules.sql
