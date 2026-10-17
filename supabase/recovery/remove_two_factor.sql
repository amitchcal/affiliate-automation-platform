-- =============================================================================
-- Recovery: remove one account's two-factor sign-in (T-05, T05-12)
--
-- Use only when the person has lost every authenticator, AFTER confirming who
-- they are by another channel (a phone call, not the email that asked for it).
-- For anyone but the owner, the owner's "Reset two-factor" on the client's
-- People screen does the same and is the first choice; this file is the
-- fallback when the screen cannot be used, for example when the owner has lost
-- their own authenticators.
--
-- What it does, in one statement (all or nothing):
--   * deletes every authenticator of the account (their challenges go with them);
--   * deletes every sign-in session and refresh token of the account, so it is
--     signed out everywhere; with 0009 applied its old tokens read nothing;
--   * writes one audit entry with the counts and your reason (never a secret).
--     It is labelled actor_type 'agent' with no actor id, the label audit_log
--     already uses for changes made without a signed-in person (as in the SQL
--     editor), and "source": "sql_editor" in its details.
-- The person then signs in with their password, is taken to the setup screen,
-- and turns two-factor sign-in on again (the owner: on two devices).
--
-- After a recovery for a lost or stolen device, the person (the owner as
-- well) should also change their password: whoever has the device may know it.
--
-- How to use, in the Supabase SQL editor:
--   1. In the "input" lines below, replace the two placeholders in capitals:
--      the person's email address, and a short reason, for example
--      "identity confirmed by phone on 17 Oct".
--   2. Run. One row comes back with the three counts. No row means nothing was
--      changed: the address matched no account, or a placeholder was left
--      unchanged, or the reason was empty.
--   3. For the owner's own account: after setting two-factor up again, run
--      supabase/verify_two_factor.sql; "the owner has a verified authenticator"
--      must read "ok".
-- =============================================================================
with input as (
  select lower(btrim('PUT-THE-EMAIL-HERE')) as email,
         btrim('PUT-THE-REASON-HERE') as reason
),
target as (
  select u.id, i.reason
  from auth.users u, input i
  where u.email = i.email
    and i.reason <> '' and i.reason not like 'PUT-THE-%'
),
removed_factors as (          -- their challenges go with them (on delete cascade)
  delete from auth.mfa_factors f using target t
  where f.user_id = t.id
  returning f.id
),
removed_tokens as (           -- refresh tokens; user_id is text in auth.refresh_tokens
  delete from auth.refresh_tokens r using target t
  where r.user_id = t.id::text
  returning r.id
),
removed_sessions as (         -- also removes their amr claims (on delete cascade)
  delete from auth.sessions s using target t
  where s.user_id = t.id
  returning s.id
)
insert into public.audit_log (actor_type, action, entity, entity_id, after)
select 'agent', 'two_factor_reset_by_sql', 'auth.users', t.id::text,
       jsonb_build_object(
         'source',                 'sql_editor',
         'reason',                 left(t.reason, 200),
         'factors_removed',        (select count(*) from removed_factors),
         'sessions_removed',       (select count(*) from removed_sessions),
         'refresh_tokens_removed', (select count(*) from removed_tokens))
from target t
returning entity_id as user_id, after;
