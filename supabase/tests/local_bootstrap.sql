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
-- Stand-in for Supabase's auth.users, used only by the seed test.
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique);
