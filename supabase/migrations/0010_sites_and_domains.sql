-- =============================================================================
-- 0010: Sites go live on proven domains (S-01, batch 2)
--
-- Before this file, any brand with the affiliate module was served to the
-- public on brands.domain, and its preview at /site/<domain> was public too.
-- After it:
--   * a brand's hosts are listed in brand_domains (core). A host is proven by
--     a DNS check made by the server: a TXT record holding the row's own
--     random code, and a record pointing at the platform. Only the server,
--     with the service role, records the result; no one can update a host's
--     status directly. A host verified for one client cannot be added or
--     verified by another;
--   * a brand's site (aff_sites, affiliate) is draft, live or offline. It goes
--     live only when the launch checklist passes, checked here, in the
--     database; the owner and operators go live, client admins may take a
--     site offline;
--   * visitors see a site only on a verified Site host of a live site, matched
--     exactly (no www. stripping, no suffix match, no fallback). A Links host
--     serves tracked-link redirects only;
--   * the preview of a site needs a signed-in member of the brand's client.
--
-- Backfill: every affiliate brand gets a draft site and its brands.domain as
-- a pending Site host. Nothing is public after this file until a domain is
-- checked and the site goes live.
--
-- One transaction. Every function sets search_path = public, pg_temp. Safe to
-- run more than once.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Host names (addition 1): lower-case ASCII or punycode, proper syntax, no
--    IP addresses, no platform or internal names. The server checks the same
--    rules first, with friendlier messages; this is the barrier.
-- ----------------------------------------------------------------------------
create or replace function host_is_valid(p_host text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_host is not null
     and length(p_host) between 4 and 253
     and p_host ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
     and p_host !~ '\.[0-9]+$'                      -- the last label is not a number: no IPv4
     and p_host !~ '(^|\.)(localhost|local|internal|invalid|test|example|arpa)$'
     and p_host !~ '(^|\.)(affiqube\.com|vercel\.app)$';
$$;

-- The host a visitor asked for: lower-case, without port or trailing dot.
-- Unlike normalise_host (0003), it keeps www.: hosts are matched exactly.
create or replace function request_host(p_host text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select rtrim(lower(split_part(btrim(coalesce(p_host, '')), ':', 1)), '.');
$$;

-- ----------------------------------------------------------------------------
-- 2. brand_domains (core).
-- ----------------------------------------------------------------------------
create table if not exists brand_domains (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  brand_id uuid not null,
  host text not null,
  purpose text not null check (purpose in ('site', 'links')),
  -- Random per row (addition 2): two brands adding the same host get two codes.
  verification_code text not null default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'pending' check (status in ('pending', 'verified')),
  verified_at timestamptz,          -- last successful check
  checked_at timestamptz,
  check_ok boolean,
  check_reason text check (check_reason in ('txt_missing', 'txt_wrong', 'not_pointing', 'lookup_failed')),
  failed_since timestamptz,         -- a failed check after a success (addition 4)
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint brand_domains_brand_fkey foreign key (brand_id, client_id)
    references brands (id, client_id) on delete cascade,
  constraint brand_domains_host_valid check (host_is_valid(host)),
  constraint brand_domains_verified_pair check ((status = 'verified') = (verified_at is not null)),
  constraint brand_domains_failed_only_after_success check (failed_since is null or status = 'verified'),
  unique (brand_id, host)
);
create index if not exists brand_domains_brand_idx on brand_domains (brand_id);
-- Addition 2: at most one verified row per host, across all clients.
create unique index if not exists brand_domains_one_verified_idx on brand_domains (host) where status = 'verified';

-- New rows start unproven, with a fresh code, whatever the request sent; a host
-- another client has verified cannot be added (addition 2).
create or replace function brand_domains_before_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.host := request_host(new.host);
  new.status := 'pending';
  new.verification_code := replace(gen_random_uuid()::text, '-', '');
  new.verified_at := null;
  new.checked_at := null;
  new.check_ok := null;
  new.check_reason := null;
  new.failed_since := null;
  new.created_by := auth.uid();
  new.created_at := now();
  if exists (
    select 1 from brand_domains d
    where d.host = new.host and d.status = 'verified' and d.client_id <> new.client_id
  ) then
    raise exception 'domain_taken';
  end if;
  return new;
end;
$$;
drop trigger if exists brand_domains_before_insert on brand_domains;
create trigger brand_domains_before_insert before insert on brand_domains
  for each row execute function brand_domains_before_insert();

drop trigger if exists audit_brand_domains on brand_domains;
create trigger audit_brand_domains after insert or delete on brand_domains
  for each row execute function audit_row();

alter table brand_domains enable row level security;
drop policy if exists brand_domains_read on brand_domains;
create policy brand_domains_read on brand_domains for select using (has_client_access(client_id));
drop policy if exists brand_domains_insert on brand_domains;
create policy brand_domains_insert on brand_domains for insert with check (can_manage(client_id));
drop policy if exists brand_domains_delete on brand_domains;
create policy brand_domains_delete on brand_domains for delete using (can_manage(client_id));
-- No update policy: a host's status changes only through record_domain_check.
revoke update, truncate on brand_domains from anon, authenticated;
revoke all on brand_domains from anon;

-- The server asks this before any DNS lookup for a host.
create or replace function can_check_domain(p_domain uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from brand_domains d where d.id = p_domain and can_manage(d.client_id));
$$;

-- The result of the server's DNS check. Called only by the server with the
-- service role, after can_check_domain() was true for p_actor.
create or replace function record_domain_check(p_domain uuid, p_actor uuid, p_ok boolean, p_reason text)
returns table (status text, verified_at timestamptz, failed_since timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row brand_domains;
begin
  select * into v_row from brand_domains d where d.id = p_domain for update;
  if not found then raise exception 'domain_not_found'; end if;

  if p_ok then
    if exists (
      select 1 from brand_domains d
      where d.host = v_row.host and d.status = 'verified' and d.id <> v_row.id and d.client_id <> v_row.client_id
    ) then
      raise exception 'domain_taken';
    end if;
    update brand_domains d
       set status = 'verified', verified_at = now(), checked_at = now(), check_ok = true,
           check_reason = null, failed_since = null
     where d.id = p_domain
    returning * into v_row;
  else
    if p_reason is null or p_reason not in ('txt_missing', 'txt_wrong', 'not_pointing', 'lookup_failed') then
      raise exception 'domain_bad_reason';
    end if;
    -- A proven host keeps its status (and keeps serving); the failure is
    -- recorded, warned about, and blocks going live again (addition 4).
    update brand_domains d
       set checked_at = now(), check_ok = false, check_reason = p_reason,
           failed_since = case when d.status = 'verified' then coalesce(d.failed_since, now()) end
     where d.id = p_domain
    returning * into v_row;
  end if;

  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, after)
  values (v_row.client_id, p_actor, 'user', 'domain_check', 'brand_domains', v_row.id::text,
          jsonb_build_object('host', v_row.host, 'ok', p_ok, 'reason', p_reason));

  return query select v_row.status, v_row.verified_at, v_row.failed_since;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. aff_sites (affiliate): one site per brand.
-- ----------------------------------------------------------------------------
create table if not exists aff_sites (
  brand_id uuid primary key,
  client_id uuid not null,
  template_key text not null default 'standard' check (template_key in ('standard')),
  status text not null default 'draft' check (status in ('draft', 'live', 'offline')),
  went_live_at timestamptz,
  went_live_by uuid,
  status_changed_at timestamptz not null default now(),
  status_changed_by uuid,
  created_at timestamptz not null default now(),
  constraint aff_sites_brand_fkey foreign key (brand_id, client_id)
    references brands (id, client_id) on delete cascade
);

alter table aff_sites enable row level security;
drop policy if exists aff_sites_read on aff_sites;
create policy aff_sites_read on aff_sites for select using (has_client_access(client_id));
-- No insert, update or delete policy: changes go through the functions below.
revoke insert, update, delete, truncate on aff_sites from anon, authenticated;
revoke all on aff_sites from anon;

-- The launch checklist (S01-4): the screen shows it and go_live() enforces it,
-- so the two can never disagree. Empty for anyone without access to the client.
create or replace function site_launch_checklist(p_brand uuid)
returns table (key text, passed boolean, detail text)
language sql stable security definer set search_path = public, pg_temp as $$
  with b as (
    select br.* from brands br where br.id = p_brand and has_client_access(br.client_id)
  ),
  missing_details as (
    select string_agg(label, ', ' order by ord) as list
    from b, (values (1, 'operator name', 'operator'), (2, 'address', 'address'), (3, 'contact email', 'email')) v(ord, label, field)
    where coalesce(btrim(b.profile ->> v.field), '') = ''
  ),
  missing_pages as (
    select string_agg(t.title, ', ' order by t.sort_order) as list
    from b, compliance_templates t
    where not exists (
      select 1 from site_pages p
      where p.brand_id = b.id and p.template_key = t.key and p.status = 'published'
    )
  ),
  hosts as (
    select d.* from brand_domains d, b where d.brand_id = b.id and d.purpose = 'site'
  )
  select 'module', brand_has_module(b.id, 'affiliate'), null::text from b
  union all
  select 'details', (select list from missing_details) is null, (select list from missing_details) from b
  union all
  select 'standard_pages', (select list from missing_pages) is null, (select list from missing_pages) from b
  union all
  select 'domain',
         exists (select 1 from hosts h where h.status = 'verified' and h.failed_since is null
                 and h.verified_at > now() - interval '30 days')
         and not exists (select 1 from hosts h where h.failed_since is not null),
         (select string_agg(h.host, ', ' order by h.host) from hosts h where h.failed_since is not null)
  from b;
$$;

-- S01-1: the site record, draft. The four standard pages are created by the
-- screen from the templates (C-04) right after, as before.
create or replace function set_up_site(p_brand uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_brand brands;
begin
  select * into v_brand from brands where id = p_brand;
  if not found or not can_manage(v_brand.client_id) then raise exception 'site_not_allowed'; end if;
  if not brand_has_module(p_brand, 'affiliate') then raise exception 'site_module_off'; end if;
  if exists (select 1 from site_launch_checklist(p_brand) c where c.key = 'details' and not c.passed) then
    raise exception 'site_details_missing';
  end if;
  insert into aff_sites (brand_id, client_id, status_changed_by)
  values (p_brand, v_brand.client_id, auth.uid())
  on conflict (brand_id) do nothing;
  if found then
    insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, after)
    values (v_brand.client_id, auth.uid(), 'user', 'site_set_up', 'aff_sites', p_brand::text,
            jsonb_build_object('template', 'standard'));
  end if;
end;
$$;

-- S01-4, S01-5: owner and operators only, and only when every item passes.
create or replace function go_live(p_brand uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_site aff_sites;
  v_failing text;
begin
  select * into v_site from aff_sites where brand_id = p_brand for update;
  if not found then
    if exists (select 1 from brands where id = p_brand and can_manage(client_id)) then
      raise exception 'site_not_set_up';
    end if;
    raise exception 'site_not_allowed';
  end if;
  if not can_manage(v_site.client_id) then raise exception 'site_not_allowed'; end if;
  select string_agg(c.key, ',') into v_failing from site_launch_checklist(p_brand) c where not c.passed;
  if v_failing is not null then
    raise exception 'site_not_ready' using detail = v_failing;
  end if;

  update aff_sites
     set status = 'live', went_live_at = now(), went_live_by = auth.uid(),
         status_changed_at = now(), status_changed_by = auth.uid()
   where brand_id = p_brand;
  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, before, after)
  values (v_site.client_id, auth.uid(), 'user', 'site_go_live', 'aff_sites', p_brand::text,
          jsonb_build_object('status', v_site.status), jsonb_build_object('status', 'live'));
end;
$$;

-- S01-5: taking a site offline reduces exposure, so client admins may too.
create or replace function take_offline(p_brand uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_site aff_sites;
begin
  select * into v_site from aff_sites where brand_id = p_brand for update;
  if not found or not can_approve(v_site.client_id) then raise exception 'site_offline_not_allowed'; end if;
  if v_site.status <> 'live' then raise exception 'site_not_live'; end if;
  update aff_sites
     set status = 'offline', status_changed_at = now(), status_changed_by = auth.uid()
   where brand_id = p_brand;
  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, before, after)
  values (v_site.client_id, auth.uid(), 'user', 'site_take_offline', 'aff_sites', p_brand::text,
          jsonb_build_object('status', 'live'), jsonb_build_object('status', 'offline'));
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Which brand a visitor's host belongs to: exact match only (addition 3).
-- ----------------------------------------------------------------------------
-- A verified Site host of a live affiliate site.
create or replace function site_brand_for_host(p_host text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select d.brand_id
  from brand_domains d
  join aff_sites s on s.brand_id = d.brand_id
  where d.host = request_host(p_host)
    and d.purpose = 'site' and d.status = 'verified'
    and s.status = 'live'
    and brand_has_module(d.brand_id, 'affiliate');
$$;

-- A verified Links host of an affiliate brand: redirects only, live or not, so
-- go.<brand> can carry tracked links while the pages stay elsewhere (S-12).
create or replace function links_brand_for_host(p_host text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select d.brand_id
  from brand_domains d
  where d.host = request_host(p_host)
    and d.purpose = 'links' and d.status = 'verified'
    and brand_has_module(d.brand_id, 'affiliate');
$$;

-- ----------------------------------------------------------------------------
-- 5. Public functions: same names, arguments and results as in 0005; the
--    brand now comes from site_brand_for_host (or, for clicks, a Links host).
-- ----------------------------------------------------------------------------
create or replace function public_brand(p_host text)
returns table (name text, domain text, tagline text, operator text, contact_email text)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.name, b.domain, b.profile ->> 'tagline', b.profile ->> 'operator', b.profile ->> 'email'
  from brands b
  where b.id = site_brand_for_host(p_host);
$$;

create or replace function public_pages(p_host text)
returns table (slug text, kind page_kind, title text, summary text, published_at timestamptz, sort_order integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.slug, p.kind, p.published_title, p.published_summary, p.published_at, coalesce(t.sort_order, 0)
  from site_pages p
  left join compliance_templates t on t.key = p.template_key
  where p.brand_id = site_brand_for_host(p_host) and p.status = 'published'
  order by p.kind, coalesce(t.sort_order, 0), p.published_at desc;
$$;

create or replace function public_page(p_host text, p_slug text)
returns table (slug text, kind page_kind, title text, summary text, body text, cta_link text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.slug, p.kind, p.published_title, p.published_summary, p.published_body,
         (select l.slug from tracked_links l
          where l.offer_id = p.offer_id and l.channel = 'site'
          order by l.created_at limit 1)
  from site_pages p
  where p.brand_id = site_brand_for_host(p_host) and p.slug = p_slug and p.status = 'published';
$$;

create or replace function record_click(
  p_host          text,
  p_link          text,
  p_page          text default null,
  p_referrer_host text default null
)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_brand uuid := coalesce(site_brand_for_host(p_host), links_brand_for_host(p_host));
  link    record;
  base    text;
  frag    text := '';
  result  text;
begin
  if v_brand is null then return null; end if;

  select l.id, l.client_id, l.brand_id, l.offer_id, l.destination, l.tracking_code
    into link
  from tracked_links l
  join offers o on o.id = l.offer_id
  where l.brand_id = v_brand
    and l.slug     = p_link
    and o.status   = 'approved';

  if not found then return null; end if;

  insert into click_events
    (client_id, brand_id, link_id, offer_id, page_slug, referrer_host)
  values
    (link.client_id, link.brand_id, link.id, link.offer_id,
     nullif(left(p_page, 200), ''), nullif(left(p_referrer_host, 200), ''));

  -- Split off any URL fragment; it must remain at the very end.
  if link.destination like '%#%' then
    frag := '#' || split_part(link.destination, '#', 2);
    base :=        split_part(link.destination, '#', 1);
  else
    base := link.destination;
  end if;

  -- Replace an existing tid= value, or append one.
  if base ~ '[?&]tid=[^&]*' then
    result := regexp_replace(base, '([?&]tid=)[^&]*', '\1' || link.tracking_code);
  elsif base like '%?%' then
    result := base || '&tid=' || link.tracking_code;
  else
    result := base || '?tid=' || link.tracking_code;
  end if;

  return result || frag;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Preview on the admin host (S01-8): signed-in members of the brand's
--    client only, by the brand's domain name, live or not. A preview click
--    shows where the link goes and records nothing.
-- ----------------------------------------------------------------------------
create or replace function preview_brand(p_domain text)
returns table (name text, domain text, tagline text, operator text, contact_email text)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.name, b.domain, b.profile ->> 'tagline', b.profile ->> 'operator', b.profile ->> 'email'
  from brands b
  where b.domain = request_host(p_domain) and has_client_access(b.client_id)
    and brand_has_module(b.id, 'affiliate');
$$;

create or replace function preview_pages(p_domain text)
returns table (slug text, kind page_kind, title text, summary text, published_at timestamptz, sort_order integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.slug, p.kind, p.published_title, p.published_summary, p.published_at, coalesce(t.sort_order, 0)
  from site_pages p
  join brands b on b.id = p.brand_id
  left join compliance_templates t on t.key = p.template_key
  where b.domain = request_host(p_domain) and has_client_access(b.client_id)
    and brand_has_module(b.id, 'affiliate') and p.status = 'published'
  order by p.kind, coalesce(t.sort_order, 0), p.published_at desc;
$$;

create or replace function preview_page(p_domain text, p_slug text)
returns table (slug text, kind page_kind, title text, summary text, body text, cta_link text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.slug, p.kind, p.published_title, p.published_summary, p.published_body,
         (select l.slug from tracked_links l
          where l.offer_id = p.offer_id and l.channel = 'site'
          order by l.created_at limit 1)
  from site_pages p
  join brands b on b.id = p.brand_id
  where b.domain = request_host(p_domain) and has_client_access(b.client_id)
    and brand_has_module(b.id, 'affiliate') and p.slug = p_slug and p.status = 'published';
$$;

create or replace function preview_link(p_domain text, p_link text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select l.destination
  from tracked_links l
  join brands b on b.id = l.brand_id
  where b.domain = request_host(p_domain) and has_client_access(b.client_id) and l.slug = p_link;
$$;

-- ----------------------------------------------------------------------------
-- 7. Backfill: a draft site for every affiliate brand, and its domain as a
--    pending Site host (when the name is a valid public host).
-- ----------------------------------------------------------------------------
insert into aff_sites (brand_id, client_id)
select b.id, b.client_id from brands b
where brand_has_module(b.id, 'affiliate')
on conflict (brand_id) do nothing;

insert into brand_domains (client_id, brand_id, host, purpose)
select b.client_id, b.id, request_host(b.domain), 'site'
from brands b
where host_is_valid(request_host(b.domain))
  and not exists (select 1 from brand_domains d where d.brand_id = b.id and d.host = request_host(b.domain));

-- ----------------------------------------------------------------------------
-- 8. Privileges.
-- ----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  -- Signed-in people, through the screens.
  foreach f in array array['can_check_domain(uuid)', 'site_launch_checklist(uuid)', 'set_up_site(uuid)',
                           'go_live(uuid)', 'take_offline(uuid)', 'preview_brand(text)', 'preview_pages(text)',
                           'preview_page(text, text)', 'preview_link(text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- The server's DNS check result: the service role only.
  execute 'revoke all on function record_domain_check(uuid, uuid, boolean, text) from public, anon, authenticated';
  execute 'grant execute on function record_domain_check(uuid, uuid, boolean, text) to service_role';
  -- Used only inside other functions.
  foreach f in array array['site_brand_for_host(text)', 'links_brand_for_host(text)',
                           'brand_domains_before_insert()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  -- Pure checks, harmless to anyone signed in (the screen validates with them).
  foreach f in array array['host_is_valid(text)', 'request_host(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;
