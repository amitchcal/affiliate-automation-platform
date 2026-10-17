-- Stand-ins for what Supabase provides, so the migration and tests run on a
-- plain local PostgreSQL. Not used in production.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon;
-- The session's claims, as Supabase's auth.jwt() returns them. Tests set
-- request.jwt.claims (for example {"aal": "aal2"}) when they need a claim.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
grant usage on schema auth to authenticated, anon;
-- Stand-in for Supabase's auth.users: the columns the migrations and tests read.
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique);
alter table auth.users add column if not exists email_confirmed_at timestamptz;
-- Stand-ins for Supabase's sign-in sessions and authenticators (T-05, 0009).
create table if not exists auth.sessions (id uuid primary key, user_id uuid not null, aal text);
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  factor_type text not null default 'totp',
  status text not null
);
-- Stand-in for Supabase's refresh tokens (user_id is text there too).
create table if not exists auth.refresh_tokens (
  id bigserial primary key,
  token text,
  user_id varchar(255),
  session_id uuid,
  revoked boolean default false
);

-- A live aal2 session for a test user, so the suites written before 0009 keep
-- testing what they test, under two-factor enforcement. Returns its id.
create or replace function auth.test_session(uid text) returns uuid
language plpgsql security definer as $$
declare
  sid uuid := md5('test-session-' || uid)::uuid;
begin
  insert into auth.sessions (id, user_id, aal) values (sid, uid::uuid, 'aal2') on conflict (id) do nothing;
  return sid;
end;
$$;
grant execute on function auth.test_session(text) to authenticated;

-- Stand-in for Supabase's service_role (the server's key; batch 2, 0010):
-- bypasses row-level security, signs in as nobody.
do $$
begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;
grant usage on schema public to service_role;
grant usage on schema auth to service_role;
