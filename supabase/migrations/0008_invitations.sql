-- =============================================================================
-- 0008: Invitations (T-03)
--
-- The owner, or an admin of a client, invites a person by email to that
-- client with one role. The invitation is accepted once by the account whose
-- confirmed email matches it, and creates exactly one membership with the
-- role it names. It expires after 7 days, can be withdrawn by the owner or the
-- client's admins, and can be declined by the invited person.
--
-- Supabase Auth creates the account and sends the single-use, expiring email
-- link. No token of ours is stored: the invitation is bound to the email
-- address, and an invitation id alone grants nothing.
--
-- Every change goes through the SECURITY DEFINER functions below; signed-in
-- users have no insert, update, or delete rights on the table. Refusals raise
-- a short stable code (for example invite_role_not_allowed), which the screens
-- turn into plain wording.
--
-- Safe to run more than once.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. The table.
-- ----------------------------------------------------------------------------
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  email text not null,
  role app_role not null,
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  last_sent_at timestamptz not null default now(),
  send_count integer not null default 1,
  accepted_at timestamptz,
  accepted_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,          -- null with revoked_at: closed by the system on expiry
  declined_at timestamptz,
  declined_by uuid,
  constraint invitations_email_normalised check (email = lower(btrim(email)) and email <> ''),
  constraint invitations_role_invitable check (role in ('operator', 'client_admin', 'client_viewer')),
  constraint invitations_one_outcome check (
    (accepted_at is not null)::int + (revoked_at is not null)::int + (declined_at is not null)::int <= 1),
  constraint invitations_accepted_pair check ((accepted_at is null) = (accepted_by is null)),
  constraint invitations_declined_pair check ((declined_at is null) = (declined_by is null)),
  constraint invitations_revoked_pair check (revoked_by is null or revoked_at is not null),
  constraint invitations_send_count check (send_count between 1 and 3),
  constraint invitations_expiry_after_creation check (expires_at > created_at)
);

-- One open invitation per client and email.
create unique index if not exists invitations_one_open_idx
  on invitations (client_id, email)
  where accepted_at is null and revoked_at is null and declined_at is null;
create index if not exists invitations_email_idx on invitations (email);

-- ----------------------------------------------------------------------------
-- 2. Helpers.
-- ----------------------------------------------------------------------------
create or replace function is_client_admin(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and client_id = p_client and role = 'client_admin'
  );
$$;

-- The signed-in account's email, lower-case, from Supabase's auth.users.
create or replace function current_user_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = auth.uid();
$$;

-- Who may invite whom (section 4 of the increment 6 plan):
--   owner: operator, client admin, viewer, into any client
--   client admin: client admin or viewer, into their own client only
--   anyone else: nobody
create or replace function can_invite(p_client uuid, p_role app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_role is null or p_role not in ('operator', 'client_admin', 'client_viewer') then false
    when is_owner() then true
    when p_role in ('client_admin', 'client_viewer') and is_client_admin(p_client) then true
    else false
  end;
$$;

-- How Supabase should deliver the email (step 0, D1): an invitation when there
-- is no account or it is not yet confirmed; a sign-in link when it is.
create or replace function invitation_delivery(p_email text) returns text
language sql stable security definer set search_path = public as $$
  select case when exists (
    select 1 from auth.users where lower(email) = p_email and email_confirmed_at is not null
  ) then 'sign_in_link' else 'invite' end;
$$;

-- Invitations sent or sent again by the caller in the last hour.
create or replace function invitations_sent_last_hour() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from audit_log
  where actor_id = auth.uid() and entity = 'invitations' and action in ('invite', 'resend')
    and created_at > now() - interval '1 hour';
$$;

create or replace function invitation_is_open(inv invitations) returns boolean
language sql immutable as $$
  select inv.accepted_at is null and inv.revoked_at is null and inv.declined_at is null;
$$;

-- ----------------------------------------------------------------------------
-- 3. Create, send again, withdraw.
-- ----------------------------------------------------------------------------
create or replace function create_invitation(p_client uuid, p_email text, p_role app_role)
returns table (invitation_id uuid, email text, expires_at timestamptz, delivery text)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_row invitations;
begin
  if auth.uid() is null then raise exception 'invite_not_signed_in'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invite_bad_email'; end if;
  if p_role is null then raise exception 'invite_no_role'; end if;
  if p_role = 'owner' then raise exception 'invite_role_not_allowed'; end if;

  if not can_invite(p_client, p_role) then
    if is_client_admin(p_client) then
      raise exception 'invite_role_not_allowed';      -- an admin of this client asking for a role above theirs
    elsif exists (select 1 from memberships where user_id = auth.uid() and client_id = p_client) then
      raise exception 'invite_not_allowed';           -- operator or viewer of this client
    else
      raise exception 'invite_other_client';          -- not this person's client at all
    end if;
  end if;

  -- Already has access: a member of this client, or the owner (same wording).
  if exists (
    select 1 from memberships m join auth.users u on u.id = m.user_id
    where lower(u.email) = v_email and (m.client_id = p_client or m.role = 'owner')
  ) then
    raise exception 'invite_already_member';
  end if;

  -- An expired open invitation is closed by the system, so a new one can be sent.
  update invitations i
  set revoked_at = now()
  where i.client_id = p_client and i.email = v_email
    and i.accepted_at is null and i.revoked_at is null and i.declined_at is null
    and i.expires_at <= now();

  if exists (
    select 1 from invitations i
    where i.client_id = p_client and i.email = v_email
      and i.accepted_at is null and i.revoked_at is null and i.declined_at is null
  ) then
    raise exception 'invite_already_open';
  end if;

  if invitations_sent_last_hour() >= 20 then raise exception 'invite_rate_limited'; end if;

  insert into invitations (client_id, email, role, invited_by)
  values (p_client, v_email, p_role, auth.uid())
  returning * into v_row;

  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, after)
  values (p_client, auth.uid(), 'user', 'invite', 'invitations', v_row.id::text,
          jsonb_build_object('email', v_email, 'role', p_role, 'expires_at', v_row.expires_at));

  return query select v_row.id, v_row.email, v_row.expires_at, invitation_delivery(v_email);
end;
$$;

-- Send again: authority is checked again now, before the server sends anything.
create or replace function resend_invitation(p_id uuid)
returns table (invitation_id uuid, email text, expires_at timestamptz, delivery text)
language plpgsql security definer set search_path = public as $$
declare
  v_row invitations;
begin
  if auth.uid() is null then raise exception 'invite_not_signed_in'; end if;
  select * into v_row from invitations where id = p_id for update;
  if not found or not can_invite(v_row.client_id, v_row.role) then
    raise exception 'invite_resend_not_allowed';
  end if;
  if not invitation_is_open(v_row) then raise exception 'invite_not_open'; end if;
  if v_row.expires_at <= now() then raise exception 'invite_expired_resend'; end if;
  if v_row.send_count >= 3 then raise exception 'invite_send_limit'; end if;
  if invitations_sent_last_hour() >= 20 then raise exception 'invite_rate_limited'; end if;

  update invitations set last_sent_at = now(), send_count = send_count + 1 where id = p_id
  returning * into v_row;

  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, after)
  values (v_row.client_id, auth.uid(), 'user', 'resend', 'invitations', v_row.id::text,
          jsonb_build_object('email', v_row.email, 'send_count', v_row.send_count));

  return query select v_row.id, v_row.email, v_row.expires_at, invitation_delivery(v_row.email);
end;
$$;

create or replace function revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row invitations;
begin
  if auth.uid() is null then raise exception 'invite_not_signed_in'; end if;
  select * into v_row from invitations where id = p_id for update;
  if not found or not (is_owner() or is_client_admin(v_row.client_id)) then
    raise exception 'invite_revoke_not_allowed';
  end if;
  if v_row.accepted_at is not null then raise exception 'invite_already_accepted'; end if;
  if not invitation_is_open(v_row) or v_row.expires_at <= now() then raise exception 'invite_not_open'; end if;

  update invitations set revoked_at = now(), revoked_by = auth.uid() where id = p_id;

  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, after)
  values (v_row.client_id, auth.uid(), 'user', 'revoke', 'invitations', v_row.id::text,
          jsonb_build_object('email', v_row.email, 'role', v_row.role));
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Accept and decline: only the person the invitation was sent to.
-- ----------------------------------------------------------------------------
create or replace function accept_invitation(p_id uuid)
returns table (client_id uuid, client_name text, role app_role)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := current_user_email();
  v_row invitations;
begin
  if auth.uid() is null or v_email is null then raise exception 'invite_not_signed_in'; end if;
  select * into v_row from invitations i where i.id = p_id for update;
  -- Another account learns nothing about the invitation, not even that it exists.
  if not found or v_row.email <> v_email then raise exception 'invite_not_for_you'; end if;
  if v_row.accepted_at is not null then raise exception 'invite_already_accepted'; end if;
  if v_row.revoked_at is not null then raise exception 'invite_withdrawn'; end if;
  if v_row.declined_at is not null then raise exception 'invite_declined'; end if;
  if v_row.expires_at <= now() then raise exception 'invite_expired'; end if;
  if (select u.email_confirmed_at from auth.users u where u.id = auth.uid()) is null then
    raise exception 'invite_email_unconfirmed';
  end if;
  if exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and (m.client_id = v_row.client_id or m.role = 'owner')
  ) then
    raise exception 'invite_already_member';
  end if;

  -- Exactly the client and role the invitation names; nothing from the caller.
  insert into memberships (user_id, client_id, role) values (auth.uid(), v_row.client_id, v_row.role);
  update invitations set accepted_at = now(), accepted_by = auth.uid() where id = p_id;

  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, after)
  values (v_row.client_id, auth.uid(), 'user', 'accept', 'invitations', v_row.id::text,
          jsonb_build_object('email', v_row.email, 'role', v_row.role));

  return query select c.id, c.name, v_row.role from clients c where c.id = v_row.client_id;
end;
$$;

create or replace function decline_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := current_user_email();
  v_row invitations;
begin
  if auth.uid() is null or v_email is null then raise exception 'invite_not_signed_in'; end if;
  select * into v_row from invitations where id = p_id for update;
  if not found or v_row.email <> v_email then raise exception 'invite_not_for_you'; end if;
  if v_row.accepted_at is not null then raise exception 'invite_already_accepted'; end if;
  if v_row.revoked_at is not null then raise exception 'invite_withdrawn'; end if;
  if v_row.declined_at is not null then raise exception 'invite_declined'; end if;
  if v_row.expires_at <= now() then raise exception 'invite_expired'; end if;

  update invitations set declined_at = now(), declined_by = auth.uid() where id = p_id;

  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, after)
  values (v_row.client_id, auth.uid(), 'user', 'decline', 'invitations', v_row.id::text,
          jsonb_build_object('email', v_row.email, 'role', v_row.role));
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Reading.
-- ----------------------------------------------------------------------------
-- A client's members with their email addresses, for the owner and that client's admins.
create or replace function client_members(p_client uuid)
returns table (user_id uuid, email text, role app_role, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_owner() or is_client_admin(p_client)) then raise exception 'members_not_allowed'; end if;
  return query
    select m.user_id, lower(u.email), m.role, m.created_at
    from memberships m join auth.users u on u.id = m.user_id
    where m.client_id = p_client
    order by m.created_at;
end;
$$;

-- The signed-in person's open invitations, with the client's name (they cannot
-- read the clients table until they have accepted).
create or replace function my_open_invitations()
returns table (id uuid, client_name text, role app_role, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, c.name, i.role, i.expires_at
  from invitations i join clients c on c.id = i.client_id
  where i.email = current_user_email()
    and i.accepted_at is null and i.revoked_at is null and i.declined_at is null
    and i.expires_at > now()
  order by i.created_at;
$$;

-- ----------------------------------------------------------------------------
-- 6. Row-level security and privileges.
-- ----------------------------------------------------------------------------
alter table invitations enable row level security;

drop policy if exists invitations_read on invitations;
create policy invitations_read on invitations for select
  using (is_owner() or is_client_admin(client_id) or email = current_user_email());
-- No insert, update or delete policy: every change goes through the functions.
revoke insert, update, delete, truncate on invitations from anon, authenticated;

-- Admins of a client can read that client's membership rows (users still read their own).
drop policy if exists memberships_read_client_admins on memberships;
create policy memberships_read_client_admins on memberships for select
  using (client_id is not null and is_client_admin(client_id));

do $$
declare
  f text;
begin
  foreach f in array array[
    'is_client_admin(uuid)', 'current_user_email()', 'can_invite(uuid, app_role)',
    'create_invitation(uuid, text, app_role)', 'resend_invitation(uuid)', 'revoke_invitation(uuid)',
    'accept_invitation(uuid)', 'decline_invitation(uuid)', 'client_members(uuid)', 'my_open_invitations()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Used only inside the functions above, which run as their owner.
  foreach f in array array[
    'invitation_delivery(text)', 'invitations_sent_last_hour()', 'invitation_is_open(invitations)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
