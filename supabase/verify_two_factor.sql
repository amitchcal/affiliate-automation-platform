-- Two-factor sign-in (T-05), migration 0009.
--
-- BEFORE applying 0009: run the whole file. Only the row "the owner has a
-- verified authenticator" must read "ok"; if it does not, 0009 will stop and
-- change nothing. Ignore the other checks for now: until 0009 is applied, most
-- of them read "missing" or "no", and a few already read "ok".
-- If the row "operators and client admins without an authenticator" is not
-- "none", tell those people before applying: from then on they see nothing until
-- they turn two-factor sign-in on (they will be taken to the setup screen).
--
-- AFTER applying 0009: run the whole file again. Every row should read "ok";
-- the last two rows are information.
select 'the seven two-factor functions exist and run as their owner' as check,
       case when count(*) = 7 then 'ok' else 'missing: expected 7, found ' || count(*) end as result
from pg_proc
where pronamespace = 'public'::regnamespace and prosecdef
  and proname in ('mfa_required', 'has_verified_factor', 'session_active', 'mfa_ok', 'access_ok',
                  'reset_two_factor', 'record_security_event')
union all
select 'a password-only session is enough only without a role that requires two-factor and without an authenticator',
       case when pg_get_functiondef(to_regprocedure('public.mfa_ok()')) like '%has_verified_factor()%'
             and pg_get_functiondef(to_regprocedure('public.mfa_ok()')) like '%mfa_required()%'
             and pg_get_functiondef(to_regprocedure('public.mfa_ok()')) like '%aal2%'
            then 'ok' else 'missing: mfa_ok() is not as in 0009' end
union all
select 'access needs a live session token and two-factor where it applies',
       case when pg_get_functiondef(to_regprocedure('public.access_ok()')) like '%session_active()%'
             and pg_get_functiondef(to_regprocedure('public.access_ok()')) like '%mfa_ok()%'
             and pg_get_functiondef(to_regprocedure('public.session_active()')) like '%session_id%'
             and pg_get_functiondef(to_regprocedure('public.session_active()')) like '%aal1%'
            then 'ok' else 'missing: access_ok() or session_active() is not as in 0009' end
union all
select 'every access helper requires access_ok()',
       case when count(*) = 5 then 'ok' else 'only ' || count(*) || ' of 5' end
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_owner', 'has_client_access', 'can_manage', 'can_approve', 'is_client_admin')
  and pg_get_functiondef(oid) like '%access_ok()%'
union all
select 'invitations act only for a live session',
       case when pg_get_functiondef(to_regprocedure('public.current_user_email()')) like '%session_active()%'
            then 'ok' else 'no: current_user_email() does not check the session' end
union all
select 'the reset is for the owner only, never for their own account, and is audited',
       case when pg_get_functiondef(to_regprocedure('public.reset_two_factor(uuid)')) like '%is_owner()%'
             and pg_get_functiondef(to_regprocedure('public.reset_two_factor(uuid)')) like '%reset_own_two_factor%'
             and pg_get_functiondef(to_regprocedure('public.reset_two_factor(uuid)')) like '%audit_log%'
             and pg_get_functiondef(to_regprocedure('public.reset_two_factor(uuid)')) like '%auth.refresh_tokens%'
            then 'ok' else 'missing: reset_two_factor() is not as in 0009' end
union all
select 'the reset can delete authenticators, sessions and refresh tokens',
       case when has_table_privilege('postgres', 'auth.mfa_factors', 'delete')
             and has_table_privilege('postgres', 'auth.sessions', 'delete')
             and has_table_privilege('postgres', 'auth.refresh_tokens', 'delete')
            then 'ok' else 'no: the postgres role cannot delete from the auth tables; tell Claude before applying 0009' end
union all
select 'visitors cannot call the two-factor functions',
       case when count(*) = 0 then 'ok' else string_agg(proname, ', ') end
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('mfa_required', 'has_verified_factor', 'session_active', 'mfa_ok', 'access_ok',
                  'reset_two_factor', 'record_security_event')
  and has_function_privilege('anon', oid, 'execute')
union all
select 'signed-in users can call the setup questions, the reset and the audit entry',
       case when count(*) = 4 then 'ok' else 'missing: ' || (4 - count(*)) || ' of 4 not callable' end
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('mfa_required', 'has_verified_factor', 'reset_two_factor', 'record_security_event')
  and has_function_privilege('authenticated', oid, 'execute')
union all
select 'internal checks are not callable by signed-in users',
       case when count(*) = 0 then 'ok' else string_agg(proname, ', ') end
from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('session_active', 'mfa_ok', 'access_ok')
  and has_function_privilege('authenticated', oid, 'execute')
union all
select 'users still read their own memberships without the second step',
       case when exists (select 1 from pg_policies where tablename = 'memberships' and policyname = 'memberships_read'
                         and qual ilike '%user_id = auth.uid()%')
            then 'ok' else 'own-row policy changed' end
union all
select 'all 13 functions defined by 0009 fix search_path to public, pg_temp',
       case when count(*) filter (where proconfig @> array['search_path=public, pg_temp']) = 13 and count(*) = 13
            then 'ok'
            else 'missing: ' || (13 - count(*) filter (where proconfig @> array['search_path=public, pg_temp'])) || ' of 13 do not' end
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('mfa_required', 'has_verified_factor', 'session_active', 'mfa_ok', 'access_ok', 'is_owner',
                  'has_client_access', 'can_manage', 'can_approve', 'is_client_admin', 'current_user_email',
                  'reset_two_factor', 'record_security_event')
union all
select 'the owner has a verified authenticator',
       case when exists (select 1 from memberships m join auth.mfa_factors f on f.user_id = m.user_id
                         where m.role = 'owner' and f.status = 'verified')
            then 'ok' else 'no: turn on two-factor sign-in for the owner before applying 0009' end
union all
select 'operators and client admins without an authenticator (information)',
       coalesce((select string_agg(distinct lower(u.email), ', ')
                 from memberships m join auth.users u on u.id = m.user_id
                 where m.role in ('operator', 'client_admin')
                   and not exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.status = 'verified')),
                'none')
union all
select 'two-factor resets in the last 30 days (information)',
       count(*)::text
from audit_log
where action like 'two_factor_reset%' and created_at > now() - interval '30 days';
