-- Run after 0008_invitations.sql in the Supabase SQL editor.
-- Each row should read "ok", or says what is wrong.
select 'invitations table exists, row-level security on' as check,
       case when exists (select 1 from pg_class where oid = 'public.invitations'::regclass and relrowsecurity)
            then 'ok' else 'row-level security is off' end as result
union all
select 'no insert, update or delete policy on invitations',
       case when count(*) = 0 then 'ok' else count(*) || ' write policies found' end
from pg_policies where schemaname = 'public' and tablename = 'invitations' and cmd <> 'SELECT'
union all
select 'signed-in users and visitors cannot write invitations directly',
       case when not has_table_privilege('authenticated', 'public.invitations', 'insert')
             and not has_table_privilege('authenticated', 'public.invitations', 'update')
             and not has_table_privilege('authenticated', 'public.invitations', 'delete')
             and not has_table_privilege('anon', 'public.invitations', 'insert')
            then 'ok' else 'a direct write privilege is still granted' end
union all
select 'no column that could hold a secret',
       case when count(*) = 0 then 'ok' else string_agg(column_name, ', ') end
from information_schema.columns
where table_schema = 'public' and table_name = 'invitations'
  and (column_name ilike '%token%' or column_name ilike '%secret%' or column_name ilike '%password%')
union all
select 'one open invitation per client and email',
       case when exists (select 1 from pg_indexes where indexname = 'invitations_one_open_idx'
                         and indexdef ilike '%unique%' and indexdef ilike '%where%')
            then 'ok' else 'index missing' end
union all
select 'the owner role cannot be invited',
       case when exists (select 1 from pg_constraint where conname = 'invitations_role_invitable')
            then 'ok' else 'role check missing' end
union all
select 'at most one of accepted, withdrawn, declined',
       case when exists (select 1 from pg_constraint where conname = 'invitations_one_outcome')
            then 'ok' else 'check missing' end
union all
select 'the ten invitation functions exist and run as their owner',
       case when count(*) = 10 then 'ok' else 'expected 10, found ' || count(*) end
from pg_proc
where pronamespace = 'public'::regnamespace and prosecdef
  and proname in ('is_client_admin', 'current_user_email', 'can_invite', 'create_invitation', 'resend_invitation',
                  'revoke_invitation', 'accept_invitation', 'decline_invitation', 'client_members', 'my_open_invitations')
union all
select 'visitors cannot call any invitation function',
       case when count(*) = 0 then 'ok' else string_agg(proname, ', ') end
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_client_admin', 'current_user_email', 'can_invite', 'create_invitation', 'resend_invitation',
                  'revoke_invitation', 'accept_invitation', 'decline_invitation', 'client_members', 'my_open_invitations',
                  'invitations_sent_last_hour', 'invitation_is_open')
  and has_function_privilege('anon', oid, 'execute')
union all
select 'signed-in users can call the ten invitation functions',
       case when count(*) = 10 then 'ok' else 'only ' || count(*) || ' of 10' end
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_client_admin', 'current_user_email', 'can_invite', 'create_invitation', 'resend_invitation',
                  'revoke_invitation', 'accept_invitation', 'decline_invitation', 'client_members', 'my_open_invitations')
  and has_function_privilege('authenticated', oid, 'execute')
union all
select 'internal helpers are not callable by signed-in users',
       case when count(*) = 0 then 'ok' else string_agg(proname, ', ') end
from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('invitations_sent_last_hour', 'invitation_is_open')
  and has_function_privilege('authenticated', oid, 'execute')
union all
select 'create and send-again return only invitation_id, email, expires_at',
       case when count(*) = 2 then 'ok' else 'a function returns other columns' end
from pg_proc
where oid in ('public.create_invitation(uuid, text, app_role)'::regprocedure, 'public.resend_invitation(uuid)'::regprocedure)
  and (select array_agg(name order by n) from unnest(proargnames, proargmodes) with ordinality as a(name, mode, n) where mode = 't')
      = array['invitation_id', 'email', 'expires_at']
union all
select 'no function says whether an address has an account',
       case when to_regprocedure('public.invitation_delivery(text)') is null then 'ok' else 'invitation_delivery() still exists' end
union all
select 'all 12 functions of 0008 fix search_path to public, pg_temp',
       case when count(*) filter (where proconfig @> array['search_path=public, pg_temp']) = 12 and count(*) = 12
            then 'ok'
            else (count(*) - count(*) filter (where proconfig @> array['search_path=public, pg_temp'])) || ' of ' || count(*) || ' do not' end
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_client_admin', 'current_user_email', 'can_invite', 'invitations_sent_last_hour', 'invitation_is_open',
                  'create_invitation', 'resend_invitation', 'revoke_invitation', 'accept_invitation', 'decline_invitation',
                  'client_members', 'my_open_invitations')
union all
select 'client admins can read their client''s memberships',
       case when exists (select 1 from pg_policies where tablename = 'memberships' and policyname = 'memberships_read_client_admins')
            then 'ok' else 'policy missing' end
union all
select 'users still read their own memberships',
       case when exists (select 1 from pg_policies where tablename = 'memberships' and policyname = 'memberships_read'
                         and qual ilike '%user_id = auth.uid()%')
            then 'ok' else 'own-row policy changed' end;
