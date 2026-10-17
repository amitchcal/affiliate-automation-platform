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
--   * writes one audit entry with the counts (never a secret).
-- The person then signs in with their password, is taken to the setup screen,
-- and turns two-factor sign-in on again (the owner: on two devices).
--
-- How to use, in the Supabase SQL editor:
--   1. In the line "select id from auth.users ..." below, replace the
--      placeholder in capitals with the person's email address.
--   2. Run. One row comes back with the three counts. No row means the address
--      matched no account and nothing was changed.
--   3. For the owner's own account: after setting two-factor up again, run
--      supabase/verify_two_factor.sql; "the owner has a verified authenticator"
--      must read "ok".
-- =============================================================================
with target as (
  select id from auth.users where email = lower(btrim('PUT-THE-EMAIL-HERE'))
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
select 'user', 'two_factor_reset_by_sql', 'auth.users', t.id::text,
       jsonb_build_object(
         'factors_removed',        (select count(*) from removed_factors),
         'sessions_removed',       (select count(*) from removed_sessions),
         'refresh_tokens_removed', (select count(*) from removed_tokens))
from target t
returning entity_id as user_id, after;
