-- =============================================================================
-- 0011: Email sign-up with recorded consent (S-08, batch 2)
--
-- A live affiliate site can show an email sign-up form, when its per-site
-- switch is on (default off). Each subscriber record keeps the exact consent
-- wording the visitor was shown (copied, not referenced), its version, the
-- time, and the host and page. The wording comes from consent_texts for the
-- brand; a request cannot supply its own.
--
-- Double opt-in (decided 17 October 2026): sign-ups are stored as pending.
-- No email is sent until the email platform exists (batch 16), which sends
-- the confirmation. No IP address, browser details, or name are stored.
--
-- Visitors have one function, subscribe(), and no table access. The same
-- answer comes back for a new address, a known one, and a filled honeypot.
-- The owner, operators and the client's admins see subscribers; viewers see
-- the count only. Deleting a subscriber leaves no email address anywhere in
-- our tables: the audit entry keeps the id, brand, client, actor and time.
--
-- One transaction. Every function sets search_path = public, pg_temp. Safe to
-- run more than once.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. The per-site switch, default off.
-- ----------------------------------------------------------------------------
alter table aff_sites add column if not exists signup_enabled boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. Consent wording, versioned; written only by migrations. The highest
--    version of a key is current. {{brand}} is the brand's name.
-- ----------------------------------------------------------------------------
create table if not exists consent_texts (
  key text not null check (key in ('email_signup')),
  version integer not null check (version > 0),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  primary key (key, version)
);

-- Version 1, reviewed by the owner before building on it (batch 2 pause).
insert into consent_texts (key, version, body) values (
  'email_signup', 1,
  'Yes, email me updates from {{brand}}: new guides and product overviews. I can unsubscribe at any time. {{brand}} will not sell my email address. See the Privacy Policy.'
) on conflict (key, version) do nothing;

alter table consent_texts enable row level security;
drop policy if exists consent_texts_read on consent_texts;
create policy consent_texts_read on consent_texts for select to authenticated using (true);
revoke insert, update, delete, truncate on consent_texts from anon, authenticated;
revoke all on consent_texts from anon;

-- The current wording for a brand, filled in. Used by the form and by subscribe().
create or replace function current_consent_text(p_key text, p_brand_name text)
returns table (version integer, body text)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.version, replace(c.body, '{{brand}}', p_brand_name)
  from consent_texts c
  where c.key = p_key
  order by c.version desc
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 3. subscribers (core: E-01 extends it to stores).
-- ----------------------------------------------------------------------------
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  brand_id uuid not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  consent_key text not null,
  consent_version integer not null,
  consent_text text not null check (btrim(consent_text) <> ''),
  consented_at timestamptz not null default now(),
  source_host text not null,
  source_page text,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  constraint subscribers_brand_fkey foreign key (brand_id, client_id)
    references brands (id, client_id) on delete cascade,
  constraint subscribers_consent_fkey foreign key (consent_key, consent_version)
    references consent_texts (key, version),
  constraint subscribers_email_normalised check (
    email = lower(btrim(email)) and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint subscribers_source_page_length check (source_page is null or length(source_page) <= 200),
  constraint subscribers_confirmed_pair check ((status = 'confirmed') = (confirmed_at is not null)),
  unique (brand_id, email)
);
create index if not exists subscribers_brand_time_idx on subscribers (brand_id, consented_at desc);

alter table subscribers enable row level security;
-- Owner, operators and the client's admin see the list; viewers do not.
drop policy if exists subscribers_read on subscribers;
create policy subscribers_read on subscribers for select using (can_approve(client_id));
-- A request to be forgotten: owner and operators.
drop policy if exists subscribers_delete on subscribers;
create policy subscribers_delete on subscribers for delete using (can_manage(client_id));
-- No insert or update policy: visitors sign up only through subscribe().
revoke insert, update, truncate on subscribers from anon, authenticated;
revoke all on subscribers from anon;

-- Deleting keeps no email address (addition 6): not audit_row(), which copies
-- the whole row; only the id, brand, client, actor and time.
create or replace function subscribers_audit_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, before, after)
  values (old.client_id, auth.uid(), case when auth.uid() is null then 'agent' else 'user' end,
          'subscriber_deleted', 'subscribers', old.id::text, null, jsonb_build_object('brand_id', old.brand_id));
  return old;
end;
$$;
drop trigger if exists audit_subscribers_delete on subscribers;
create trigger audit_subscribers_delete after delete on subscribers
  for each row execute function subscribers_audit_delete();

-- The number of subscribers, for anyone with access to the client (viewers too).
create or replace function subscriber_count(p_brand uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer from subscribers s
  where s.brand_id = p_brand
    and exists (select 1 from brands b where b.id = p_brand and has_client_access(b.client_id));
$$;

-- ----------------------------------------------------------------------------
-- 4. The switch: owner and operators; on only for a live site.
-- ----------------------------------------------------------------------------
create or replace function set_signup(p_brand uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_site aff_sites;
begin
  select * into v_site from aff_sites where brand_id = p_brand for update;
  if not found or not can_manage(v_site.client_id) then raise exception 'signup_not_allowed'; end if;
  if p_on and v_site.status <> 'live' then raise exception 'signup_site_not_live'; end if;
  if v_site.signup_enabled = coalesce(p_on, false) then return; end if;
  update aff_sites set signup_enabled = coalesce(p_on, false) where brand_id = p_brand;
  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, before, after)
  values (v_site.client_id, auth.uid(), 'user', case when p_on then 'signup_on' else 'signup_off' end,
          'aff_sites', p_brand::text,
          jsonb_build_object('signup_enabled', v_site.signup_enabled), jsonb_build_object('signup_enabled', coalesce(p_on, false)));
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. subscribe(): the visitor's only way in.
-- ----------------------------------------------------------------------------
create or replace function subscribe(
  p_host      text,
  p_email     text,
  p_page      text,
  p_consented boolean,
  p_honeypot  text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_brand uuid := site_brand_for_host(p_host);
  v_site aff_sites;
  v_name text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_consent record;
begin
  if v_brand is null then raise exception 'signup_unavailable'; end if;
  select * into v_site from aff_sites where brand_id = v_brand;
  if not v_site.signup_enabled then raise exception 'signup_unavailable'; end if;

  -- A filled honeypot is a bot: the same answer as success, nothing stored.
  if coalesce(btrim(p_honeypot), '') <> '' then return; end if;

  if p_consented is not true then raise exception 'signup_no_consent'; end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'signup_bad_email';
  end if;
  if (select count(*) from subscribers s
      where s.brand_id = v_brand and s.consented_at > now() - interval '1 minute') >= 30 then
    raise exception 'signup_rate_limited';
  end if;

  select b.name into v_name from brands b where b.id = v_brand;
  select * into v_consent from current_consent_text('email_signup', v_name);

  -- A known address keeps its original consent record; the answer is the same.
  insert into subscribers (client_id, brand_id, email, consent_key, consent_version, consent_text,
                           source_host, source_page)
  values (v_site.client_id, v_brand, v_email, 'email_signup', v_consent.version, v_consent.body,
          request_host(p_host), nullif(left(btrim(coalesce(p_page, '')), 200), ''))
  on conflict (brand_id, email) do nothing;
end;
$$;

-- The form's wording for a live site with sign-up on, for visitors; nothing otherwise.
create or replace function public_signup(p_host text)
returns table (consent_version integer, consent_text text)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.version, c.body
  from aff_sites s
  join brands b on b.id = s.brand_id
  cross join lateral current_consent_text('email_signup', b.name) c
  where s.brand_id = site_brand_for_host(p_host) and s.signup_enabled;
$$;

-- ----------------------------------------------------------------------------
-- 6. Privileges.
-- ----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array['subscribe(text, text, text, boolean, text)', 'public_signup(text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['set_signup(uuid, boolean)', 'subscriber_count(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['current_consent_text(text, text)', 'subscribers_audit_delete()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

commit;
