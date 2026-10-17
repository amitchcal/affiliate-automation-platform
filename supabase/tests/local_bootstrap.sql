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
