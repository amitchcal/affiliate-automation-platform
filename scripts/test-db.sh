#!/usr/bin/env bash
# Runs the schema and the database tests against scratch local databases.
# Requires a local PostgreSQL and a superuser able to create databases.
set -euo pipefail
PSQL="${PSQL:-psql -v ON_ERROR_STOP=1 -q}"

run_suite() {
  local db="$1" test_file="$2" guard_test="${3:-no}"
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
  if [ "$guard_test" = yes ]; then
    # The lockout guard: with no owner authenticator, 0009 stops and changes nothing.
    local guard
    if guard=$($PSQL -d "$db" -f supabase/migrations/0009_two_factor.sql 2>&1); then
      echo "FAILED: 0009 applied although the owner has no authenticator"
      return 1
    fi
    if ! echo "$guard" | grep -q "Stopped: turn on two-factor sign-in for the owner account first"; then
      echo "$guard"
      echo "FAILED: 0009 stopped for another reason"
      return 1
    fi
    if [ "$($PSQL -d "$db" -Atc "select pg_get_functiondef('is_owner()'::regprocedure) like '%access_ok%'")" != "f" ]; then
      echo "FAILED: 0009's lockout guard left changes behind"
      return 1
    fi
    # to_regprocedure, not to_regproc: on PostgreSQL 16 to_regproc('access_ok()')
    # reads null for any name with brackets, so it could never fail.
    if [ "$($PSQL -d "$db" -Atc "select to_regprocedure('public.access_ok()') is null")" != "t" ]; then
      echo "FAILED: 0009's lockout guard left access_ok() behind"
      return 1
    fi
  fi
  # Every suite runs under two-factor enforcement (0009). Only the test runner
  # may skip the lockout guard: scratch databases have no owner authenticator.
  PGOPTIONS="-c affiqube.allow_owner_without_factor=on" $PSQL -d "$db" -f supabase/migrations/0009_two_factor.sql >/dev/null
  # A second run proves 0009 is safe to apply twice.
  PGOPTIONS="-c affiqube.allow_owner_without_factor=on" $PSQL -d "$db" -f supabase/migrations/0009_two_factor.sql >/dev/null
  $PSQL -d "$db" -f supabase/tests/local_grants.sql >/dev/null
  # A failing test stops psql with an ERROR, so the suite's PASSED line never prints.
  local out
  if ! out=$($PSQL -d "$db" -f "$test_file" 2>&1); then
    echo "$out" | grep -E "ERROR|PASSED" || true
    echo "FAILED: $test_file"
    return 1
  fi
  echo "$out" | grep -E "PASSED"
  if [ "$guard_test" = yes ]; then recovery_sql_test "$db"; fi
}

# supabase/recovery/remove_two_factor.sql itself, with only the address filled
# in, against the two-factor suite's users (T05-12, D4).
recovery_sql_test() {
  local db="$1" left out
  $PSQL -d "$db" -c "
    insert into auth.sessions (id, user_id, aal) values
      ('44444444-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'aal2'),
      ('55555555-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'aal1');
    insert into auth.refresh_tokens (token, user_id, session_id) values
      ('r1', '00000000-0000-0000-0000-0000000000a1', '44444444-0000-0000-0000-0000000000a1'),
      ('r2', '00000000-0000-0000-0000-0000000000a1', '55555555-0000-0000-0000-0000000000a1');" >/dev/null
  local reason="identity confirmed by phone on 17 Oct"
  # An address that matches no account: no row back, nothing changed.
  out=$(sed -e "s/PUT-THE-EMAIL-HERE/nobody@test.example/" -e "s/PUT-THE-REASON-HERE/$reason/" supabase/recovery/remove_two_factor.sql | $PSQL -d "$db" -At)
  if [ -n "$out" ]; then echo "FAILED: the recovery SQL returned a row for an unknown address: $out"; return 1; fi
  # The reason left as its placeholder, or empty: no row back, nothing changed.
  out=$(sed -e "s/PUT-THE-EMAIL-HERE/admin@test.example/" supabase/recovery/remove_two_factor.sql | $PSQL -d "$db" -At)
  if [ -n "$out" ]; then echo "FAILED: the recovery SQL ran with the reason placeholder left in: $out"; return 1; fi
  out=$(sed -e "s/PUT-THE-EMAIL-HERE/admin@test.example/" -e "s/PUT-THE-REASON-HERE/  /" supabase/recovery/remove_two_factor.sql | $PSQL -d "$db" -At)
  if [ -n "$out" ]; then echo "FAILED: the recovery SQL ran with an empty reason: $out"; return 1; fi
  if [ "$($PSQL -d "$db" -At -c "select count(*) from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a1'")" != "1" ]; then
    echo "FAILED: a refused recovery run removed the authenticator"; return 1
  fi
  # The admin, typed with capitals and spaces as a person might.
  out=$(sed -e "s/PUT-THE-EMAIL-HERE/ Admin@Test.Example /" -e "s/PUT-THE-REASON-HERE/$reason/" supabase/recovery/remove_two_factor.sql | $PSQL -d "$db" -At)
  if ! echo "$out" | grep -q '"factors_removed": 1, "sessions_removed": 2, "refresh_tokens_removed": 2'; then
    echo "FAILED: the recovery SQL returned: $out"; return 1
  fi
  if [ "$($PSQL -d "$db" -At -c "select actor_type || '|' || coalesce(actor_id::text, 'none') || '|' || (after ->> 'source') || '|' || (after ->> 'reason')
                                 from audit_log where action = 'two_factor_reset_by_sql'")" != "agent|none|sql_editor|$reason" ]; then
    echo "FAILED: the recovery audit entry should be agent, no actor, sql_editor, and the reason"; return 1
  fi
  left=$($PSQL -d "$db" -At -c "
    select (select count(*) from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a1')
         + (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000a1')
         + (select count(*) from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-0000000000a1')
         || '/' || (select count(*) from audit_log where action = 'two_factor_reset_by_sql'
                    and entity_id = '00000000-0000-0000-0000-0000000000a1')
         || '/' || (select count(*) from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a0')")
  if [ "$left" != "0/1/1" ]; then
    echo "FAILED: after the recovery SQL (left/audit rows/owner factors): $left"; return 1
  fi
  echo "ALL RECOVERY SQL TESTS PASSED"
}

run_suite map_test_access  supabase/tests/access_rules.sql
run_suite map_test_site    supabase/tests/site_rules.sql
run_suite map_test_results supabase/tests/results_rules.sql
run_suite map_test_consistency supabase/tests/consistency_rules.sql
run_suite map_test_modules supabase/tests/module_rules.sql
run_suite map_test_privacy supabase/tests/privacy_template_rules.sql
run_suite map_test_invitations supabase/tests/invitation_rules.sql
run_suite map_test_two_factor supabase/tests/two_factor_rules.sql yes
