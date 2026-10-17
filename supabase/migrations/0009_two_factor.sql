-- =============================================================================
-- 0009: Two-factor sign-in, enforced in the database (T-05)
--
-- Two-factor sign-in is required for the owner, operators and client admins,
-- and optional for viewers (decided 17 October 2026). A viewer who has turned
-- it on is held to it as well. A session that has used only a password (aal1)
-- then reads no client data and changes nothing, whatever the screens do.
--
-- The four access helpers from 0001 (is_owner, has_client_access, can_manage,
-- can_approve) and two from 0008 (is_client_admin, current_user_email) are
-- redefined here, so every existing row-level policy and rule follows without
-- being rewritten. They also require the session to still exist (D5): signing
-- out, or a recovery that deletes sessions, cuts data access at once.
--
-- A person's own membership rows stay readable without the second step
-- (memberships_read: user_id = auth.uid()), so the setup screen can tell
-- whether two-factor is required for them.
--
-- The owner can reset another person's two-factor sign-in (reset_two_factor):
-- their authenticators, sessions and refresh tokens are deleted and the audit
-- entry is written in the same transaction. Turning it on, adding and removing
-- an authenticator are audited through record_security_event.
--
-- Lockout guard: this file stops, changing nothing, unless the owner account
-- has a verified authenticator. Turn two-factor sign-in on for the owner (on
-- two devices) and check verify_two_factor.sql before running it.
--
-- The whole file is one transaction: it applies completely or not at all.
-- Every function sets search_path = public, pg_temp. Safe to run more than once.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Lockout guard (the first statement). The test runners alone set
--    affiqube.allow_owner_without_factor.
-- ----------------------------------------------------------------------------
do $$
begin
  if coalesce(current_setting('affiqube.allow_owner_without_factor', true), '') <> 'on'
     and not exists (
       select 1 from memberships m join auth.mfa_factors f on f.user_id = m.user_id
       where m.role = 'owner' and f.status = 'verified'
     ) then
    raise exception 'Stopped: turn on two-factor sign-in for the owner account first (Two-factor sign-in, in the application), then run this file again. Nothing was changed.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. What the session has proved.
-- ----------------------------------------------------------------------------
-- The caller's role requires two-factor sign-in. Reads memberships directly, not
-- through the access helpers, so it answers for a password-only session too.
create or replace function mfa_required() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and role in ('owner', 'operator', 'client_admin')
  );
$$;

-- The caller has turned two-factor sign-in on (a verified authenticator).
create or replace function has_verified_factor() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;

-- The caller's token is a real sign-in session that still exists (D5). Supabase
-- puts an aal and a session_id claim in every session token; a token missing
-- either is refused. A session deleted by sign-out or by a recovery loses data
-- access at once, even while its token has not expired.
create or replace function session_active() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'aal', '') in ('aal1', 'aal2')
     and exists (select 1 from auth.sessions where id = nullif(auth.jwt() ->> 'session_id', '')::uuid);
$$;

-- The second step is done, or this person needs none: their role does not
-- require it and they have not turned it on.
create or replace function mfa_ok() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' or (not mfa_required() and not has_verified_factor());
$$;

-- Everything a session needs before it may see or change client data.
create or replace function access_ok() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and session_active() and mfa_ok();
$$;

-- ----------------------------------------------------------------------------
-- 2. The access helpers, redefined to require access_ok().
--    Same names, arguments and results as in 0001 and 0008.
-- ----------------------------------------------------------------------------
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select access_ok() and exists (
    select 1 from memberships where user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function has_client_access(target_client uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select is_owner() or (access_ok() and exists (
    select 1 from memberships where user_id = auth.uid() and client_id = target_client
  ));
$$;

-- Owner and operators: may create and change a client's working data.
create or replace function can_manage(target_client uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select is_owner() or (access_ok() and exists (
    select 1 from memberships
    where user_id = auth.uid() and client_id = target_client and role = 'operator'
  ));
$$;

-- Owner, operators and the client's own admin: may select and approve offers.
create or replace function can_approve(target_client uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select is_owner() or (access_ok() and exists (
    select 1 from memberships
    where user_id = auth.uid() and client_id = target_client
      and role in ('operator', 'client_admin')
  ));
$$;

-- From 0008: a client's admin may invite and see its people.
create or replace function is_client_admin(p_client uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select access_ok() and exists (
    select 1 from memberships
    where user_id = auth.uid() and client_id = p_client and role = 'client_admin'
  );
$$;

-- From 0008: the signed-in account's email, used to read, accept and decline
-- one's own invitations. Accepting needs no second step (a new person has none
-- yet), but it does need a session that still exists.
create or replace function current_user_email() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select lower(email) from auth.users where id = auth.uid() and session_active();
$$;

-- ----------------------------------------------------------------------------
-- 3. Reset and audit (T05-8, T05-9).
-- ----------------------------------------------------------------------------
-- The owner resets another person's two-factor sign-in, for a lost phone: their
-- authenticators, sessions and refresh tokens go, so they are signed out
-- everywhere and must set it up again. The audit entry is written in the same
-- transaction as the deletions: if it cannot be written, nothing is deleted.
-- The same deletions as supabase/recovery/remove_two_factor.sql.
create or replace function reset_two_factor(p_user uuid)
returns table (factors_removed integer, sessions_removed integer, refresh_tokens_removed integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_email text;
  v_factors integer;
  v_sessions integer;
  v_tokens integer;
begin
  if not is_owner() then raise exception 'reset_not_allowed'; end if;
  if p_user = auth.uid() then raise exception 'reset_own_two_factor'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = p_user;
  if not found then raise exception 'reset_no_such_user'; end if;

  delete from auth.mfa_factors f where f.user_id = p_user;   -- their challenges go with them
  get diagnostics v_factors = row_count;
  delete from auth.sessions s where s.user_id = p_user;
  get diagnostics v_sessions = row_count;
  delete from auth.refresh_tokens r where r.user_id = p_user::text;
  get diagnostics v_tokens = row_count;

  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, after)
  values (null, auth.uid(), 'user', 'two_factor_reset', 'auth.users', p_user::text,
          jsonb_build_object('email', v_email, 'factors_removed', v_factors,
                             'sessions_removed', v_sessions, 'refresh_tokens_removed', v_tokens));

  return query select v_factors, v_sessions, v_tokens;
end;
$$;

-- A person's own two-factor change, recorded after Supabase confirms it (the
-- change itself is made in the browser, through Supabase). Only appends.
create or replace function record_security_event(p_action text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not session_active() then raise exception 'security_event_not_allowed'; end if;
  if p_action not in ('two_factor_on', 'two_factor_added', 'two_factor_removed') then
    raise exception 'security_event_unknown';
  end if;
  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id)
  values (null, auth.uid(), 'user', p_action, 'auth.users', auth.uid()::text);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Privileges.
-- ----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  -- The setup screen asks the first two with a password-only session. The
  -- reset checks for the owner itself; the event checks for a live session.
  foreach f in array array['mfa_required()', 'has_verified_factor()', 'reset_two_factor(uuid)', 'record_security_event(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Used only inside the access helpers, which run as their owner.
  foreach f in array array['session_active()', 'mfa_ok()', 'access_ok()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- Redefinition keeps existing grants; visitors never needed these.
  foreach f in array array['is_client_admin(uuid)', 'current_user_email()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;
