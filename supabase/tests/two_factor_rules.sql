-- =============================================================================
-- Two-factor sign-in tests (T-05, migration 0009). Run after 0001 to 0009
-- against a scratch database.
--
-- Users of client A                         verified authenticator
--   owner      ...a0   owner                yes
--   admin      ...a1   client admin         yes
--   viewer     ...a2   viewer               no   (optional, not turned on)
--   operator   ...a3   operator             yes
--   viewer_tf  ...a4   viewer               yes  (optional, turned on: held to it)
--   admin_new  ...a5   client admin         no   (required, not set up yet)
--   invitee    ...a6   (no membership)      no   (invited as a viewer)
--   new_op     ...a7   (no membership)      no   (invited as an operator)
-- =============================================================================
\set ON_ERROR_STOP on

insert into clients (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Client B');
insert into brands (id, client_id, name, domain) values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A', 'brand-a.test'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'Brand B', 'brand-b.test');

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a0', 'owner@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'viewer@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'operator@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a4', 'viewer-tf@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a5', 'admin-new@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a6', 'invitee@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a7', 'new-op@test.example', now());

insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', null, 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_viewer'),
  ('00000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'operator'),
  ('00000000-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_viewer'),
  ('00000000-0000-0000-0000-0000000000a5', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_admin');

insert into auth.mfa_factors (user_id, status) values
  ('00000000-0000-0000-0000-0000000000a0', 'verified'),
  ('00000000-0000-0000-0000-0000000000a1', 'verified'),
  ('00000000-0000-0000-0000-0000000000a3', 'verified'),
  ('00000000-0000-0000-0000-0000000000a4', 'verified'),
  ('00000000-0000-0000-0000-0000000000a5', 'unverified');  -- a setup started but not finished

-- Sign in as a user at an assurance level, in a session that exists (as
-- Supabase's tokens carry them: sub, aal, session_id). Pass live => false for
-- a session that has been deleted since its token was issued.
create or replace function test_login(uid text, aal text, live boolean default true) returns void language plpgsql as $$
declare
  sid uuid := md5(uid || aal)::uuid;
begin
  execute 'reset role';
  delete from auth.sessions where id = sid;
  if live then insert into auth.sessions (id, user_id, aal) values (sid, uid::uuid, aal); end if;
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'aal', aal, 'session_id', sid)::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Sign in with a token whose claims are given exactly (sub is always added), in
-- a live session of that user, to test tokens that lack a claim.
create or replace function test_login_claims(uid text, claims jsonb) returns void language plpgsql as $$
declare
  sid uuid := md5(uid || 'claims')::uuid;
begin
  execute 'reset role';
  insert into auth.sessions (id, user_id, aal) values (sid, uid::uuid, 'aal2') on conflict (id) do nothing;
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims', (claims || jsonb_build_object('sub', uid))::text, true);
  execute 'set local role authenticated';
end;
$$;

-- The session id test_login_claims uses for a user, to put in a token.
create or replace function test_claims_session(uid text) returns text language sql as $$
  select md5(uid || 'claims')::uuid::text;
$$;

-- Runs a statement that must fail with one of the given refusal codes.
create or replace function expect_refusal(p_sql text, p_codes text[]) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected refusal %, but this was allowed: %', p_codes, p_sql;
exception when others then
  if not (sqlerrm = any (p_codes)) then raise; end if;
end;
$$;

create or replace function test_superuser() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- What a session can see and do with client A's data.
create or replace function can_read_brand_a() returns boolean language sql as $$
  select exists (select 1 from brands where id = 'aaaaaaaa-1111-0000-0000-000000000000');
$$;
grant execute on function test_login(text, text, boolean), test_login_claims(text, jsonb), test_claims_session(text),
  expect_refusal(text, text[]), test_superuser(), can_read_brand_a() to authenticated;

-- ---------- Required roles: nothing at aal1; everything as before at aal2 ----------
begin;
do $$
declare
  who text;
  wrote boolean;
begin
  foreach who in array array['00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a1',
                             '00000000-0000-0000-0000-0000000000a3'] loop
    perform test_login(who, 'aal1');
    if can_read_brand_a() or exists (select 1 from clients) or exists (select 1 from offers) then
      raise exception 'T-05: % read client data with only a password', who;
    end if;
    if is_owner() or has_client_access('aaaaaaaa-0000-0000-0000-000000000000')
       or can_manage('aaaaaaaa-0000-0000-0000-000000000000') or can_approve('aaaaaaaa-0000-0000-0000-000000000000')
       or is_client_admin('aaaaaaaa-0000-0000-0000-000000000000') then
      raise exception 'T-05: an access helper said yes to % at aal1', who;
    end if;
    update brands set niche = 'changed at aal1' where id = 'aaaaaaaa-1111-0000-0000-000000000000';
    wrote := found;
    if wrote then raise exception 'T-05: % changed a brand with only a password', who; end if;

    perform test_login(who, 'aal2');
    if not can_read_brand_a() then raise exception 'T-05: % cannot read client A at aal2', who; end if;
  end loop;

  -- Inviting needs the second step too.
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal1');
  begin
    perform create_invitation('aaaaaaaa-0000-0000-0000-000000000000', 'x@test.example', 'client_viewer');
    raise exception 'T-05: a client admin invited with only a password';
  exception when others then
    if sqlerrm not in ('invite_not_allowed', 'invite_other_client', 'invite_role_not_allowed') then raise; end if;
  end;

  -- At aal2 the owner sees both clients and the admin and operator see client A only.
  perform test_login('00000000-0000-0000-0000-0000000000a0', 'aal2');
  if (select count(*) from clients) <> 2 then raise exception 'T-05: the owner at aal2 should see both clients'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal2');
  if (select count(*) from brands) <> 1 then raise exception 'T-05: the admin at aal2 should see client A''s brand only'; end if;
  update brands set niche = 'changed at aal2' where id = 'aaaaaaaa-1111-0000-0000-000000000000';
  if found then raise exception 'T-05: a client admin may not change a brand (unchanged rule from 0001)'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a3', 'aal2');
  update brands set niche = 'changed by the operator' where id = 'aaaaaaaa-1111-0000-0000-000000000000';
  if not found then raise exception 'T-05: the operator at aal2 should change the brand as before'; end if;
end $$;
rollback;

-- ---------- Viewers: without an authenticator as before; with one, held to it ----------
begin;
do $$
begin
  perform test_login('00000000-0000-0000-0000-0000000000a2', 'aal1');
  if not can_read_brand_a() then raise exception 'T-05: a viewer without two-factor must work with the password alone'; end if;

  perform test_login('00000000-0000-0000-0000-0000000000a4', 'aal1');
  if can_read_brand_a() then raise exception 'T-05: a viewer who turned two-factor on read data with only a password'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a4', 'aal2');
  if not can_read_brand_a() then raise exception 'T-05: a viewer with two-factor cannot read at aal2'; end if;

  -- After their authenticators are removed (a reset), the viewer works with the password again.
  perform test_superuser();
  delete from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a4';
  perform test_login('00000000-0000-0000-0000-0000000000a4', 'aal1');
  if not can_read_brand_a() then raise exception 'T-05: a stale factor still blocks the viewer'; end if;
end $$;
rollback;

-- ---------- Required role without two-factor: no data, but its own membership and the setup questions ----------
begin;
do $$
begin
  perform test_login('00000000-0000-0000-0000-0000000000a5', 'aal1');
  if can_read_brand_a() then raise exception 'T-05: a client admin without two-factor read client data'; end if;
  if (select count(*) from memberships) <> 1 then
    raise exception 'T-05: a password-only session should read exactly its own membership row';
  end if;
  if (select role from memberships) <> 'client_admin' then raise exception 'T-05: own membership role'; end if;
  if not mfa_required() then raise exception 'T-05: mfa_required() should be true for a client admin'; end if;
  if has_verified_factor() then raise exception 'T-05: an unverified factor counts as turned on'; end if;

  -- The admin with two-factor, at aal1: own row only, not the client's other rows.
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal1');
  if (select count(*) from memberships) <> 1 then
    raise exception 'T-05: at aal1 a client admin should read only their own membership';
  end if;
  if not has_verified_factor() then raise exception 'T-05: has_verified_factor() should be true'; end if;

  -- After the factor rows are deleted (recovery), the admin still gets nothing at aal1.
  perform test_superuser();
  delete from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a1';
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal1');
  if can_read_brand_a() then raise exception 'T-05: a required role read data after its factor was removed'; end if;
  if (select count(*) from memberships) <> 1 then raise exception 'T-05: own membership must stay readable'; end if;
end $$;
rollback;

-- ---------- mfa_required() for each role ----------
begin;
do $$
declare
  who text;
  expected boolean;
begin
  for who, expected in
    select * from (values ('00000000-0000-0000-0000-0000000000a0', true), ('00000000-0000-0000-0000-0000000000a1', true),
                          ('00000000-0000-0000-0000-0000000000a3', true), ('00000000-0000-0000-0000-0000000000a2', false),
                          ('00000000-0000-0000-0000-0000000000ff', false)) v(u, e)
  loop
    perform test_login(who, 'aal1');
    if mfa_required() <> expected then raise exception 'T-05: mfa_required() for % should be %', who, expected; end if;
  end loop;
end $$;
rollback;

-- ---------- A deleted session loses access at once, even at aal2 (D5) ----------
begin;
do $$
begin
  perform test_login('00000000-0000-0000-0000-0000000000a0', 'aal2', live => false);
  if can_read_brand_a() or is_owner() then raise exception 'T-05: a deleted session still reads data'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a2', 'aal1', live => false);
  if can_read_brand_a() then raise exception 'T-05: a viewer''s deleted session still reads data'; end if;
  if current_user_email() is not null then raise exception 'T-05: a deleted session can still act on invitations'; end if;
  -- The same people with live sessions.
  perform test_login('00000000-0000-0000-0000-0000000000a0', 'aal2');
  if not is_owner() then raise exception 'T-05: the owner''s live session'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a2', 'aal1');
  if current_user_email() <> 'viewer@test.example' then raise exception 'T-05: current_user_email() with a live session'; end if;
end $$;
rollback;

-- ---------- Invitations (0008) under 0009: a client admin at aal2 can, at aal1 cannot ----------
begin;
do $$
declare
  inv uuid;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal2');
  select invitation_id into inv from create_invitation('aaaaaaaa-0000-0000-0000-000000000000', 'aal2-invite@test.example', 'client_viewer');
  if inv is null then raise exception 'T-05: a client admin at aal2 could not invite'; end if;
  perform resend_invitation(inv);
  perform test_superuser();
  if (select send_count from invitations where id = inv) <> 2 then raise exception 'T-05: a client admin at aal2 could not send again'; end if;

  -- The same admin with only a password: Send again and Withdraw are refused, and change nothing.
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal1');
  perform expect_refusal(format('select resend_invitation(%L)', inv), array['invite_resend_not_allowed']);
  perform expect_refusal(format('select revoke_invitation(%L)', inv), array['invite_revoke_not_allowed']);
  perform test_superuser();
  if (select send_count from invitations where id = inv) <> 2 or (select revoked_at from invitations where id = inv) is not null then
    raise exception 'T-05: a refused request at aal1 changed the invitation';
  end if;
  if (select count(*) from audit_log where entity_id = inv::text) <> 2 then
    raise exception 'T-05: a refused request at aal1 wrote an audit row';
  end if;

  -- Back at aal2: Withdraw works.
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal2');
  perform revoke_invitation(inv);
  perform test_superuser();
  if (select revoked_at from invitations where id = inv) is null then raise exception 'T-05: a client admin at aal2 could not withdraw'; end if;
end $$;
rollback;

-- ---------- An invitee with no authenticator: a live aal1 session can list, accept and decline ----------
begin;
do $$
declare
  first_inv uuid;
  second_inv uuid;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a0', 'aal2');
  select invitation_id into first_inv from create_invitation('aaaaaaaa-0000-0000-0000-000000000000', 'invitee@test.example', 'client_viewer');
  select invitation_id into second_inv from create_invitation('bbbbbbbb-0000-0000-0000-000000000000', 'invitee@test.example', 'client_viewer');

  -- A deleted session can do none of it.
  perform test_login('00000000-0000-0000-0000-0000000000a6', 'aal1', live => false);
  if (select count(*) from my_open_invitations()) <> 0 then raise exception 'T-05: a deleted session listed invitations'; end if;
  perform expect_refusal(format('select accept_invitation(%L)', first_inv), array['invite_not_signed_in']);
  perform expect_refusal(format('select decline_invitation(%L)', second_inv), array['invite_not_signed_in']);
  perform test_superuser();
  if exists (select 1 from memberships where user_id = '00000000-0000-0000-0000-0000000000a6') then
    raise exception 'T-05: a deleted session created a membership';
  end if;
  if (select count(*) from invitations where email = 'invitee@test.example' and accepted_at is null and declined_at is null) <> 2 then
    raise exception 'T-05: a deleted session closed an invitation';
  end if;

  -- A token with no aal claim is not a session token either.
  perform test_login_claims('00000000-0000-0000-0000-0000000000a6',
    jsonb_build_object('session_id', test_claims_session('00000000-0000-0000-0000-0000000000a6')));
  if (select count(*) from my_open_invitations()) <> 0 then raise exception 'T-05: a token with no aal claim listed invitations'; end if;

  -- The live password-only session can.
  perform test_login('00000000-0000-0000-0000-0000000000a6', 'aal1');
  if (select count(*) from my_open_invitations()) <> 2 then raise exception 'T-05: a live aal1 invitee should list both invitations'; end if;
  perform accept_invitation(first_inv);
  perform decline_invitation(second_inv);
  if (select count(*) from my_open_invitations()) <> 0 then raise exception 'T-05: both invitations should be closed'; end if;
  -- As a viewer without an authenticator, the new member reads client A with the password alone.
  if not can_read_brand_a() then raise exception 'T-05: the new viewer cannot read client A with the password alone'; end if;
  perform test_superuser();
  if (select count(*) from memberships where user_id = '00000000-0000-0000-0000-0000000000a6') <> 1 then
    raise exception 'T-05: accepting should create exactly one membership';
  end if;
  if (select declined_at from invitations where id = second_inv) is null then raise exception 'T-05: the decline was not recorded'; end if;
end $$;
rollback;

-- ---------- A new operator reads no client data until the second step ----------
begin;
do $$
declare
  inv uuid;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a0', 'aal2');
  select invitation_id into inv from create_invitation('aaaaaaaa-0000-0000-0000-000000000000', 'new-op@test.example', 'operator');

  perform test_login('00000000-0000-0000-0000-0000000000a7', 'aal1');
  perform accept_invitation(inv);
  if can_read_brand_a() or exists (select 1 from clients) or can_manage('aaaaaaaa-0000-0000-0000-000000000000') then
    raise exception 'T-05: a new operator read client data before setting up two-factor';
  end if;
  update brands set niche = 'by the new operator at aal1' where id = 'aaaaaaaa-1111-0000-0000-000000000000';
  if found then raise exception 'T-05: a new operator changed a brand before setting up two-factor'; end if;
  if not mfa_required() then raise exception 'T-05: two-factor should now be required for the new operator'; end if;
  if (select role from memberships) <> 'operator' then raise exception 'T-05: the new operator should read their own membership'; end if;

  -- They set it up (a verified authenticator) and do the second step.
  perform test_superuser();
  insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-0000000000a7', 'verified');
  perform test_login('00000000-0000-0000-0000-0000000000a7', 'aal1');
  if can_read_brand_a() then raise exception 'T-05: a new operator with an authenticator read data with only a password'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a7', 'aal2');
  if not can_read_brand_a() then raise exception 'T-05: the new operator at aal2 should read client A'; end if;
end $$;
rollback;

-- ---------- Tokens missing a claim read nothing, for a required role and for a viewer ----------
begin;
do $$
declare
  who text;
begin
  -- The owner (required) and a viewer without an authenticator (optional), each in a live session.
  foreach who in array array['00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a2'] loop
    -- No session_id claim, even at aal2.
    perform test_login_claims(who, jsonb_build_object('aal', 'aal2'));
    if can_read_brand_a() or exists (select 1 from clients) or is_owner()
       or has_client_access('aaaaaaaa-0000-0000-0000-000000000000') then
      raise exception 'T-05: a token with no session_id claim read data (%)', who;
    end if;
    -- No aal claim, in a session that exists.
    perform test_login_claims(who, jsonb_build_object('session_id', test_claims_session(who)));
    if can_read_brand_a() or exists (select 1 from clients) or is_owner()
       or has_client_access('aaaaaaaa-0000-0000-0000-000000000000') then
      raise exception 'T-05: a token with no aal claim read data (%)', who;
    end if;
    -- An unknown aal value.
    perform test_login_claims(who, jsonb_build_object('aal', 'aal3', 'session_id', test_claims_session(who)));
    if can_read_brand_a() then raise exception 'T-05: a token with an unknown aal read data (%)', who; end if;
    -- The same claims, complete, do read: the cases above fail for the missing claim alone.
    perform test_login_claims(who, jsonb_build_object('aal', 'aal2', 'session_id', test_claims_session(who)));
    if not can_read_brand_a() then raise exception 'T-05: a complete token should read client A (%)', who; end if;
  end loop;
end $$;
rollback;

-- ---------- The owner resets another person's two-factor sign-in (T05-8, D6) ----------
create or replace function admin_reset_footprint() returns text language sql as $$
  select (select count(*) from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a1') || '/'
      || (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000a1') || '/'
      || (select count(*) from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-0000000000a1') || '/'
      || (select count(*) from audit_log where action = 'two_factor_reset');
$$;

begin;
do $$
declare
  who text;
  r record;
  before_reset text;
begin
  -- The admin has a factor, three sessions (one is the test's own sign-in) and two refresh tokens.
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal2');
  perform test_superuser();
  insert into auth.sessions (id, user_id, aal) values
    ('11111111-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'aal2'),
    ('22222222-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'aal1');
  insert into auth.refresh_tokens (token, user_id, session_id) values
    ('t1', '00000000-0000-0000-0000-0000000000a1', '11111111-0000-0000-0000-0000000000a1'),
    ('t2', '00000000-0000-0000-0000-0000000000a1', '22222222-0000-0000-0000-0000000000a1');
  before_reset := admin_reset_footprint();
  if before_reset <> '1/3/2/0' then raise exception 'T-05: reset test setup is %', before_reset; end if;

  -- Not the admin themself, not an operator, not a viewer, and not the owner with only a password.
  foreach who in array array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3',
                             '00000000-0000-0000-0000-0000000000a2'] loop
    perform test_login(who, 'aal2');
    perform expect_refusal('select reset_two_factor(''00000000-0000-0000-0000-0000000000a1'')',
                           array['reset_not_allowed', 'reset_own_two_factor']);
  end loop;
  perform test_login('00000000-0000-0000-0000-0000000000a0', 'aal1');
  perform expect_refusal('select reset_two_factor(''00000000-0000-0000-0000-0000000000a1'')', array['reset_not_allowed']);
  -- The owner cannot reset their own (S32), nor an account that does not exist.
  perform test_login('00000000-0000-0000-0000-0000000000a0', 'aal2');
  perform expect_refusal('select reset_two_factor(''00000000-0000-0000-0000-0000000000a0'')', array['reset_own_two_factor']);
  perform expect_refusal('select reset_two_factor(''00000000-0000-0000-0000-0000000000ff'')', array['reset_no_such_user']);
  perform test_superuser();
  if admin_reset_footprint() <> before_reset then raise exception 'T-05: a refused reset changed something: %', admin_reset_footprint(); end if;
  if (select count(*) from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a0') <> 1 then
    raise exception 'T-05: the owner''s refused own reset removed their factor';
  end if;

  -- The owner resets the admin: everything goes, with one audit row holding the counts.
  perform test_login('00000000-0000-0000-0000-0000000000a0', 'aal2');
  select * into r from reset_two_factor('00000000-0000-0000-0000-0000000000a1');
  if (r.factors_removed, r.sessions_removed, r.refresh_tokens_removed) <> (1, 3, 2) then
    raise exception 'T-05: reset returned % % %', r.factors_removed, r.sessions_removed, r.refresh_tokens_removed;
  end if;
  perform test_superuser();
  if admin_reset_footprint() <> '0/0/0/1' then raise exception 'T-05: after the reset: %', admin_reset_footprint(); end if;
  if not exists (
    select 1 from audit_log
    where action = 'two_factor_reset' and actor_id = '00000000-0000-0000-0000-0000000000a0'
      and entity_id = '00000000-0000-0000-0000-0000000000a1'
      and after = jsonb_build_object('email', 'admin@test.example', 'factors_removed', 1,
                                     'sessions_removed', 3, 'refresh_tokens_removed', 2)
  ) then
    raise exception 'T-05: the reset''s audit row is missing or wrong';
  end if;

  -- Afterwards the admin, with only a password, reads nothing and is asked to set up again.
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal1');
  if can_read_brand_a() then raise exception 'T-05: the reset admin read data with only a password'; end if;
  if has_verified_factor() or not mfa_required() then raise exception 'T-05: the reset admin should be asked to set up again'; end if;
end $$;
rollback;

-- The audit row is written in the same transaction: if it cannot be written, nothing is deleted (S29).
begin;
create function refuse_reset_audit() returns trigger language plpgsql as $$
begin
  if new.action = 'two_factor_reset' then raise exception 'audit unavailable'; end if;
  return new;
end;
$$;
create trigger refuse_reset_audit before insert on audit_log for each row execute function refuse_reset_audit();
do $$
begin
  insert into auth.sessions (id, user_id, aal) values ('33333333-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'aal2');
  insert into auth.refresh_tokens (token, user_id) values ('t3', '00000000-0000-0000-0000-0000000000a1');
  perform test_login('00000000-0000-0000-0000-0000000000a0', 'aal2');
  begin
    perform reset_two_factor('00000000-0000-0000-0000-0000000000a1');
    raise exception 'T-05: the reset succeeded although its audit row could not be written';
  exception when others then
    if sqlerrm <> 'audit unavailable' then raise; end if;
  end;
  perform test_superuser();
  if admin_reset_footprint() <> '1/1/1/0' then
    raise exception 'T-05: a reset without its audit row deleted something: %', admin_reset_footprint();
  end if;
end $$;
rollback;

-- ---------- Own two-factor changes are audited (T05-9) ----------
begin;
do $$
begin
  perform test_login('00000000-0000-0000-0000-0000000000a2', 'aal1');
  perform record_security_event('two_factor_on');
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal2');
  perform record_security_event('two_factor_added');
  perform record_security_event('two_factor_removed');
  perform expect_refusal('select record_security_event(''two_factor_reset'')', array['security_event_unknown']);
  perform test_login('00000000-0000-0000-0000-0000000000a1', 'aal2', live => false);
  perform expect_refusal('select record_security_event(''two_factor_on'')', array['security_event_not_allowed']);
  perform test_superuser();
  if (select count(*) from audit_log where action like 'two_factor_%') <> 3 then
    raise exception 'T-05: expected 3 two-factor audit rows, found %', (select count(*) from audit_log where action like 'two_factor_%');
  end if;
  if not exists (select 1 from audit_log where action = 'two_factor_on' and actor_id = '00000000-0000-0000-0000-0000000000a2'
                 and entity_id = '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'T-05: the audit row does not name the person';
  end if;
end $$;
rollback;

-- ---------- Privileges and search paths ----------
do $$
declare
  f text;
begin
  foreach f in array array['mfa_required()', 'has_verified_factor()', 'reset_two_factor(uuid)', 'record_security_event(text)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'T-05: visitors can call %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'T-05: signed-in users cannot call %', f; end if;
  end loop;
  foreach f in array array['session_active()', 'mfa_ok()', 'access_ok()'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'T-05: % should be callable only inside the access helpers', f;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('mfa_required', 'has_verified_factor', 'session_active', 'mfa_ok', 'access_ok', 'is_owner',
                      'has_client_access', 'can_manage', 'can_approve', 'is_client_admin', 'current_user_email',
                      'reset_two_factor', 'record_security_event')
      and not coalesce(proconfig @> array['search_path=public, pg_temp'], false)
  ) then
    raise exception 'T-05: a function of 0009 does not set search_path = public, pg_temp';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('is_owner', 'has_client_access', 'can_manage', 'can_approve', 'is_client_admin')
      and pg_get_functiondef(oid) like '%access_ok()%') <> 5 then
    raise exception 'T-05: every access helper must require access_ok()';
  end if;
end $$;

\echo 'ALL TWO-FACTOR RULE TESTS PASSED'
