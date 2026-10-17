-- =============================================================================
-- Invitation tests (T-03, migration 0008). Run after 0001 to 0008 against a
-- scratch database.
--
-- Users (auth.users stand-in, see local_bootstrap.sql)
--   owner      ...a0  owner@test.example
--   admin_a    ...a1  admin-a@test.example     client admin of A
--   viewer_a   ...a2  viewer-a@test.example    viewer of A
--   operator_a ...a3  operator-a@test.example  operator of A
--   admin_b    ...b1  admin-b@test.example     client admin of B
--   new        ...c1  new@test.example         confirmed account, no membership
--   unconf     ...c2  unconf@test.example      account not yet confirmed
--   other      ...c3  other@test.example       confirmed account, no membership
-- =============================================================================
\set ON_ERROR_STOP on

insert into clients (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Client B');

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a0', 'owner@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a1', 'admin-a@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'viewer-a@test.example', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'operator-a@test.example', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'admin-b@test.example', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'new@test.example', now()),
  ('00000000-0000-0000-0000-0000000000c2', 'unconf@test.example', null),
  ('00000000-0000-0000-0000-0000000000c3', 'other@test.example', now());

insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', null, 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_viewer'),
  ('00000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'operator'),
  ('00000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000000', 'client_admin');

-- Act as a signed-in user for the rest of the transaction.
create or replace function test_login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  -- A live session that has done the second step (aal2), as after 0009 (T-05).
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'aal', 'aal2', 'session_id', auth.test_session(uid))::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Back to the test's own superuser session, to inspect what really happened.
create or replace function test_superuser() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- Runs a statement that must fail with the given refusal code.
create or replace function expect_refusal(p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm <> p_code then
      raise exception 'expected refusal % but got: % (for: %)', p_code, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'expected refusal % but the statement succeeded: %', p_code, p_sql;
end;
$$;
grant execute on function test_login(text), test_superuser(), expect_refusal(text, text) to authenticated, anon;

-- ---------- Who may invite whom: the full matrix, and refusals write nothing ----------
begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
  b constant uuid := 'bbbbbbbb-0000-0000-0000-000000000000';
  r app_role;
begin
  -- Owner: all three roles, any client.
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  foreach r in array array['operator', 'client_admin', 'client_viewer']::app_role[] loop
    perform create_invitation(a, 'owner-to-a-' || r || '@test.example', r);
    perform create_invitation(b, 'owner-to-b-' || r || '@test.example', r);
  end loop;
  perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'x-owner@test.example', 'owner'), 'invite_role_not_allowed');

  -- Client admin of A: client admin and viewer into A; operator refused (owner-only).
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform create_invitation(a, 'admin-to-a-admin@test.example', 'client_admin');
  perform create_invitation(a, 'admin-to-a-viewer@test.example', 'client_viewer');
  perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'admin-to-a-operator@test.example', 'operator'), 'invite_role_not_allowed');
  -- ... and nothing into B.
  foreach r in array array['operator', 'client_admin', 'client_viewer']::app_role[] loop
    perform expect_refusal(format('select create_invitation(%L, %L, %L)', b, 'admin-a-to-b@test.example', r), 'invite_other_client');
  end loop;

  -- Viewer and operator of A: nobody.
  foreach r in array array['operator', 'client_admin', 'client_viewer']::app_role[] loop
    perform test_login('00000000-0000-0000-0000-0000000000a2');
    perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'viewer-invites@test.example', r), 'invite_not_allowed');
    perform test_login('00000000-0000-0000-0000-0000000000a3');
    perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'operator-invites@test.example', r), 'invite_not_allowed');
    -- Admin of B into A: another client.
    perform test_login('00000000-0000-0000-0000-0000000000b1');
    perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'admin-b-to-a@test.example', r), 'invite_other_client');
  end loop;

  perform test_superuser();
  if (select count(*) from invitations) <> 8 then
    raise exception 'T-03: expected 8 invitations from the allowed cells of the matrix, found %', (select count(*) from invitations);
  end if;
  if exists (select 1 from invitations where email like 'admin-to-a-operator%' or email like '%invites@%' or email like 'admin-%-to-%') then
    raise exception 'T-03: a refused invitation was written';
  end if;
  if (select count(*) from audit_log where entity = 'invitations' and action = 'invite') <> 8 then
    raise exception 'T-03: expected one audit row per invitation';
  end if;
end $$;
rollback;

-- ---------- Bad input; already has access; one open invitation per client and email ----------
begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
  first_id uuid;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'not-an-email', 'client_viewer'), 'invite_bad_email');
  perform expect_refusal(format('select create_invitation(%L, %L, null)', a, 'x@test.example'), 'invite_no_role');
  -- A member of A, and the owner, get the same refusal.
  perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'VIEWER-A@test.example', 'client_viewer'), 'invite_already_member');
  perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'owner@test.example', 'client_viewer'), 'invite_already_member');

  -- Stored trimmed and lower-case; a second open one is refused.
  select invitation_id into first_id from create_invitation(a, '  Pat@Test.Example ', 'client_viewer');
  perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'pat@test.example', 'client_admin'), 'invite_already_open');

  -- After withdrawal a new one is allowed.
  perform revoke_invitation(first_id);
  perform create_invitation(a, 'pat@test.example', 'client_viewer');

  -- After expiry a new one is allowed; the expired one is closed by the system.
  perform test_superuser();
  update invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
  where email = 'pat@test.example' and revoked_at is null;
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform create_invitation(a, 'pat@test.example', 'client_viewer');

  perform test_superuser();
  if (select email from invitations where id = first_id) <> 'pat@test.example' then
    raise exception 'T-03: the email was not stored trimmed and lower-case';
  end if;
  if (select count(*) from invitations where email = 'pat@test.example') <> 3 then
    raise exception 'T-03: expected 3 invitations for pat (withdrawn, expired, open)';
  end if;
  if (select count(*) from invitations where email = 'pat@test.example' and revoked_at is not null and revoked_by is null) <> 1 then
    raise exception 'T-03: the expired invitation was not closed by the system';
  end if;
end $$;
rollback;

-- ---------- Create and Send again return exactly invitation_id, email, expires_at ----------
-- Nothing about the address's account (whether it exists, whether it is
-- confirmed) leaves the database, so nothing can reach the browser (addition (b)).
do $$
declare
  f text;
  out_names text[];
begin
  foreach f in array array['create_invitation(uuid, text, app_role)', 'resend_invitation(uuid)'] loop
    select array_agg(name order by n)
    into out_names
    from pg_proc p,
         unnest(p.proargnames, p.proargmodes) with ordinality as a(name, mode, n)
    where p.oid = f::regprocedure and a.mode = 't';
    if out_names is distinct from array['invitation_id', 'email', 'expires_at'] then
      raise exception 'T-03: % must return exactly invitation_id, email, expires_at; it returns %', f, out_names;
    end if;
  end loop;
end $$;

begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
  inv uuid;
  keys text[];
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  -- No account, unconfirmed account, confirmed account: the same three fields each time.
  foreach keys slice 1 in array array[
    (select array_agg(k order by k) from create_invitation(a, 'nobody-yet@test.example', 'client_viewer') r, jsonb_object_keys(to_jsonb(r)) k),
    (select array_agg(k order by k) from create_invitation(a, 'unconf@test.example', 'client_viewer') r, jsonb_object_keys(to_jsonb(r)) k),
    (select array_agg(k order by k) from create_invitation(a, 'new@test.example', 'client_viewer') r, jsonb_object_keys(to_jsonb(r)) k)
  ] loop
    if keys is distinct from array['email', 'expires_at', 'invitation_id'] then
      raise exception 'T-03: create_invitation returned %', keys;
    end if;
  end loop;
  select id into inv from invitations where email = 'new@test.example';
  if (select array_agg(k order by k) from resend_invitation(inv) r, jsonb_object_keys(to_jsonb(r)) k)
     is distinct from array['email', 'expires_at', 'invitation_id'] then
    raise exception 'T-03: resend_invitation must return exactly invitation_id, email, expires_at';
  end if;
end $$;
rollback;

-- ---------- Accept: exactly the named role, once; then every refusal ----------
begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
  inv uuid;
  got record;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  select invitation_id into inv from create_invitation(a, 'new@test.example', 'client_viewer');

  -- Another account: refused, learns nothing, nothing written.
  perform test_login('00000000-0000-0000-0000-0000000000c3');
  perform expect_refusal(format('select accept_invitation(%L)', inv), 'invite_not_for_you');
  perform expect_refusal(format('select decline_invitation(%L)', inv), 'invite_not_for_you');
  if exists (select 1 from invitations where id = inv) then
    raise exception 'T-03: another account can read the invitation';
  end if;

  -- The invited person reads only their own invitations, with the client's name.
  perform test_login('00000000-0000-0000-0000-0000000000c1');
  if (select count(*) from invitations) <> 1 then raise exception 'T-03: invitee should read exactly their own invitation'; end if;
  if (select client_name from my_open_invitations()) <> 'Client A' then raise exception 'T-03: my_open_invitations should name the client'; end if;

  select * into got from accept_invitation(inv);
  if got.client_id <> a or got.role <> 'client_viewer' then raise exception 'T-03: accept returned the wrong client or role'; end if;
  perform expect_refusal(format('select accept_invitation(%L)', inv), 'invite_already_accepted');
  perform expect_refusal(format('select decline_invitation(%L)', inv), 'invite_already_accepted');

  perform test_superuser();
  if (select count(*) from memberships where user_id = '00000000-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'T-03: accepting must create exactly one membership';
  end if;
  if not exists (select 1 from memberships where user_id = '00000000-0000-0000-0000-0000000000c1'
                 and client_id = a and role = 'client_viewer') then
    raise exception 'T-03: the membership must have exactly the invitation''s client and role';
  end if;
  if (select accepted_by from invitations where id = inv) <> '00000000-0000-0000-0000-0000000000c1' then
    raise exception 'T-03: accepted_by not recorded';
  end if;
  if not exists (select 1 from audit_log where entity = 'invitations' and entity_id = inv::text and action = 'accept'
                 and actor_id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'T-03: accept was not audited';
  end if;
  -- An accepted invitation cannot be withdrawn.
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal(format('select revoke_invitation(%L)', inv), 'invite_already_accepted');
end $$;
rollback;

begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
  inv uuid;
begin
  -- Expired.
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  select invitation_id into inv from create_invitation(a, 'new@test.example', 'client_viewer');
  perform test_superuser();
  update invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 second' where id = inv;
  perform test_login('00000000-0000-0000-0000-0000000000c1');
  perform expect_refusal(format('select accept_invitation(%L)', inv), 'invite_expired');
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal(format('select revoke_invitation(%L)', inv), 'invite_not_open');

  -- Withdrawn.
  select invitation_id into inv from create_invitation(a, 'new@test.example', 'client_viewer');
  perform revoke_invitation(inv);
  perform expect_refusal(format('select revoke_invitation(%L)', inv), 'invite_not_open');
  perform test_login('00000000-0000-0000-0000-0000000000c1');
  perform expect_refusal(format('select accept_invitation(%L)', inv), 'invite_withdrawn');

  -- Email not confirmed.
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  select invitation_id into inv from create_invitation(a, 'unconf@test.example', 'client_viewer');
  perform test_login('00000000-0000-0000-0000-0000000000c2');
  perform expect_refusal(format('select accept_invitation(%L)', inv), 'invite_email_unconfirmed');

  -- Became a member in between: refused, and the existing role is not changed.
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  select invitation_id into inv from create_invitation(a, 'other@test.example', 'client_admin');
  perform test_superuser();
  insert into memberships (user_id, client_id, role) values ('00000000-0000-0000-0000-0000000000c3', a, 'client_viewer');
  perform test_login('00000000-0000-0000-0000-0000000000c3');
  perform expect_refusal(format('select accept_invitation(%L)', inv), 'invite_already_member');

  perform test_superuser();
  if exists (select 1 from memberships where user_id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2')) then
    raise exception 'T-03: a refused acceptance created a membership';
  end if;
  if (select role from memberships where user_id = '00000000-0000-0000-0000-0000000000c3') <> 'client_viewer' then
    raise exception 'T-03: an invitation changed an existing role';
  end if;
end $$;
rollback;

-- ---------- Decline ----------
begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
  inv uuid;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  select invitation_id into inv from create_invitation(a, 'new@test.example', 'client_viewer');
  -- Only the invited person can decline; the inviter cannot.
  perform expect_refusal(format('select decline_invitation(%L)', inv), 'invite_not_for_you');
  perform test_login('00000000-0000-0000-0000-0000000000c1');
  perform decline_invitation(inv);
  perform expect_refusal(format('select accept_invitation(%L)', inv), 'invite_declined');
  perform expect_refusal(format('select decline_invitation(%L)', inv), 'invite_declined');
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal(format('select revoke_invitation(%L)', inv), 'invite_not_open');
  -- A new invitation to the same address is allowed afterwards.
  perform create_invitation(a, 'new@test.example', 'client_viewer');

  perform test_superuser();
  if exists (select 1 from memberships where user_id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'T-03: declining created a membership';
  end if;
  if (select declined_by from invitations where id = inv) <> '00000000-0000-0000-0000-0000000000c1' then
    raise exception 'T-03: declined_by not recorded';
  end if;
  if not exists (select 1 from audit_log where entity_id = inv::text and action = 'decline') then
    raise exception 'T-03: decline was not audited';
  end if;
end $$;
rollback;

-- ---------- Send again: authority re-checked; refusals change nothing ----------
begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
  inv uuid;
  audit_before integer;
  who text;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  select invitation_id into inv from create_invitation(a, 'nobody-yet@test.example', 'client_viewer');
  perform resend_invitation(inv);  -- send 2

  perform test_superuser();
  audit_before := (select count(*) from audit_log);
  foreach who in array array['00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3',
                             '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1'] loop
    perform test_login(who);
    perform expect_refusal(format('select resend_invitation(%L)', inv), 'invite_resend_not_allowed');
  end loop;

  -- A client admin who has lost the role since sending.
  perform test_superuser();
  delete from memberships where user_id = '00000000-0000-0000-0000-0000000000a1';
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal(format('select resend_invitation(%L)', inv), 'invite_resend_not_allowed');

  perform test_superuser();
  if (select send_count from invitations where id = inv) <> 2 then raise exception 'T-03: a refused resend changed send_count'; end if;
  if (select count(*) from audit_log) <> audit_before then raise exception 'T-03: a refused resend wrote an audit row'; end if;

  -- The owner can send the 3rd; a 4th is refused.
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  perform resend_invitation(inv);
  perform expect_refusal(format('select resend_invitation(%L)', inv), 'invite_send_limit');

  -- Expired, then closed.
  perform test_superuser();
  update invitations set send_count = 1, created_at = now() - interval '8 days', expires_at = now() - interval '1 second' where id = inv;
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  perform expect_refusal(format('select resend_invitation(%L)', inv), 'invite_expired_resend');
  perform test_superuser();
  update invitations set expires_at = now() + interval '1 day', revoked_at = now() where id = inv;
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  perform expect_refusal(format('select resend_invitation(%L)', inv), 'invite_not_open');
end $$;
rollback;

-- ---------- Rate limit: 20 sends per inviter per hour ----------
begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
begin
  insert into audit_log (client_id, actor_id, action, entity, entity_id)
  select a, '00000000-0000-0000-0000-0000000000a1', 'invite', 'invitations', g::text from generate_series(1, 20) g;
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal(format('select create_invitation(%L, %L, %L)', a, 'one-more@test.example', 'client_viewer'), 'invite_rate_limited');
  -- Another inviter is not affected.
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  perform create_invitation(a, 'one-more@test.example', 'client_viewer');
end $$;
rollback;

-- ---------- Another client's admin cannot see or act on A's invitations or members ----------
begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
  inv uuid;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  select invitation_id into inv from create_invitation(a, 'nobody-yet@test.example', 'client_viewer');

  perform test_login('00000000-0000-0000-0000-0000000000b1');
  if exists (select 1 from invitations) then raise exception 'T-03: admin of B can read A''s invitations'; end if;
  if exists (select 1 from memberships where client_id = a) then raise exception 'T-03: admin of B can read A''s memberships'; end if;
  perform expect_refusal(format('select * from client_members(%L)', a), 'members_not_allowed');
  perform expect_refusal(format('select revoke_invitation(%L)', inv), 'invite_revoke_not_allowed');
  perform expect_refusal(format('select resend_invitation(%L)', inv), 'invite_resend_not_allowed');

  -- A viewer of A does not see invitations, other members, or the member list.
  perform test_login('00000000-0000-0000-0000-0000000000a2');
  if exists (select 1 from invitations) then raise exception 'T-03: a viewer can read invitations'; end if;
  if (select count(*) from memberships) <> 1 then raise exception 'T-03: a viewer should read only their own membership'; end if;
  perform expect_refusal(format('select * from client_members(%L)', a), 'members_not_allowed');
  perform expect_refusal(format('select revoke_invitation(%L)', inv), 'invite_revoke_not_allowed');

  -- The admin of A sees A's members with their addresses, and A's membership rows.
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  if (select count(*) from client_members(a)) <> 3 then raise exception 'T-03: admin of A should see 3 members of A'; end if;
  if not exists (select 1 from client_members(a) where email = 'viewer-a@test.example' and role = 'client_viewer') then
    raise exception 'T-03: client_members should give each member''s email and role';
  end if;
  if (select count(*) from memberships) <> 3 then raise exception 'T-03: admin of A should read A''s 3 membership rows'; end if;
  if (select count(*) from invitations) <> 1 then raise exception 'T-03: admin of A should read A''s invitation'; end if;
end $$;
rollback;

-- ---------- No direct writes; no secrets in the audit log; visitors can call nothing ----------
begin;
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-000000000000';
  inv uuid;
  refused boolean := false;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  select invitation_id into inv from create_invitation(a, 'nobody-yet@test.example', 'client_viewer');

  begin
    insert into invitations (client_id, email, role, invited_by)
    values (a, 'direct@test.example', 'client_admin', '00000000-0000-0000-0000-0000000000a1');
  exception when others then refused := true;
  end;
  if not refused then raise exception 'T-03: a direct insert into invitations was allowed'; end if;

  -- Update and delete find no row they may change.
  update invitations set role = 'operator', expires_at = now() + interval '1 year' where id = inv;
  delete from invitations where id = inv;

  -- The owner cannot write directly either.
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  update invitations set role = 'operator' where id = inv;

  perform test_superuser();
  if (select role from invitations where id = inv) <> 'client_viewer' then raise exception 'T-03: a direct update changed an invitation'; end if;
  if exists (select 1 from invitations where email = 'direct@test.example') then raise exception 'T-03: direct insert written'; end if;

  if exists (
    select 1 from audit_log, jsonb_object_keys(coalesce(after, '{}'::jsonb)) k
    where entity = 'invitations' and (k ilike '%token%' or k ilike '%secret%' or k ilike '%password%')
  ) then
    raise exception 'T-03: an invitation audit row carries a secret-like field';
  end if;
end $$;
rollback;

do $$
declare
  f text;
begin
  foreach f in array array[
    'is_client_admin(uuid)', 'current_user_email()', 'can_invite(uuid, app_role)',
    'create_invitation(uuid, text, app_role)', 'resend_invitation(uuid)', 'revoke_invitation(uuid)',
    'accept_invitation(uuid)', 'decline_invitation(uuid)', 'client_members(uuid)', 'my_open_invitations()'
  ] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'T-03: visitors can call %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'T-03: signed-in users cannot call %', f; end if;
  end loop;
  foreach f in array array['invitations_sent_last_hour()', 'invitation_is_open(invitations)'] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'T-03: % should be callable only inside the invitation functions', f;
    end if;
  end loop;
  if to_regprocedure('invitation_delivery(text)') is not null then
    raise exception 'T-03: invitation_delivery() should no longer exist';
  end if;
end $$;

-- ---------- Every function of 0008 fixes its search path to public, pg_temp ----------
do $$
declare
  missing text;
begin
  select string_agg(p.proname, ', ') into missing
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('is_client_admin', 'current_user_email', 'can_invite', 'invitations_sent_last_hour',
                      'invitation_is_open', 'create_invitation', 'resend_invitation', 'revoke_invitation',
                      'accept_invitation', 'decline_invitation', 'client_members', 'my_open_invitations')
    and not coalesce(p.proconfig @> array['search_path=public, pg_temp'], false);
  if missing is not null then raise exception 'T-03: search_path is not public, pg_temp in: %', missing; end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('is_client_admin', 'current_user_email', 'can_invite', 'invitations_sent_last_hour',
                      'invitation_is_open', 'create_invitation', 'resend_invitation', 'revoke_invitation',
                      'accept_invitation', 'decline_invitation', 'client_members', 'my_open_invitations')) <> 12 then
    raise exception 'T-03: expected the 12 functions of 0008';
  end if;
end $$;

\echo 'ALL INVITATION RULE TESTS PASSED'
