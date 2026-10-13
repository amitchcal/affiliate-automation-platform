-- =============================================================================
-- Affiqube: module entitlement and the two test brands
-- Increment 5. Run after 0001_core.sql to 0004_results.sql.
--
-- 1. Each brand gets a business type: affiliate, dropshipping, or both (T-07).
-- 2. brand_has_module() answers "does this brand's type include this module?"
-- 3. The database refuses inserts and updates to affiliate tables for a brand
--    without the affiliate module. Deletes stay allowed so old data can be
--    cleaned up. network_sales is not refused: sales are facts reported by
--    the network, and refusing them would lose earnings records.
-- 4. The public site functions serve only brands with the affiliate module.
-- 5. A change of business type is written to audit_log (T-06).
-- 6. The seeded brand AffiQube (affiqube.com) becomes AffilyVault
--    (affilyvault.com, affiliate), keeping its offers, links, approval
--    settings and ClickBank connection. Famperia (famperia.com, dropshipping,
--    US) is added. Page text is not changed: verify_modules.sql lists any page
--    that still mentions AffiQube, for the owner to review.
--
-- Safe to run more than once. Existing brands become 'affiliate', which is
-- true of every brand before this migration. Step 6 does nothing on a
-- database without the client Vividha Marketing.
-- Verify with supabase/verify_modules.sql after applying.
-- T-07
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Business type (T-07)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'business_type') then
    create type business_type as enum ('affiliate', 'dropshipping', 'both');
  end if;
end $$;

alter table brands
  add column if not exists business_type business_type not null default 'affiliate';

-- ----------------------------------------------------------------------------
-- 2. Module check. SECURITY DEFINER so a trigger can read the brand's type
--    whatever the caller's own access to brands.
-- ----------------------------------------------------------------------------
create or replace function brand_has_module(p_brand uuid, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_module
             when 'affiliate'    then b.business_type in ('affiliate', 'both')
             when 'dropshipping' then b.business_type in ('dropshipping', 'both')
             else false
           end
    from brands b
    where b.id = p_brand
  ), false);
$$;

revoke execute on function brand_has_module(uuid, text) from public;
grant execute on function brand_has_module(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Refusal in the database (T-07). The module name is the trigger argument.
--    The brand comes from the row's brand_id, or from its offer when the
--    table has no brand_id (offer_metrics, offer_rules).
-- ----------------------------------------------------------------------------
create or replace function enforce_brand_module() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  module_name  text  := tg_argv[0];
  row_data     jsonb := to_jsonb(new);
  target_brand uuid  := (row_data ->> 'brand_id')::uuid;
  brand_row    record;
begin
  if target_brand is null and row_data ? 'offer_id' then
    select o.brand_id into target_brand from offers o where o.id = (row_data ->> 'offer_id')::uuid;
  end if;

  if target_brand is null or brand_has_module(target_brand, module_name) then
    return new;
  end if;

  select b.name, b.client_id, b.business_type into brand_row from brands b where b.id = target_brand;

  -- This trigger runs before the row-level policies. For a caller with no
  -- access to the brand, say nothing about it and let the policies refuse.
  if auth.uid() is not null and not has_client_access(brand_row.client_id) then
    return new;
  end if;

  raise exception 'Refused: % is set up for %, which does not include %. Change the brand''s business type to use this feature.',
    brand_row.name,
    case brand_row.business_type when 'affiliate' then 'affiliate marketing' else brand_row.business_type::text end,
    case module_name when 'affiliate' then 'affiliate marketing' else module_name end;
end;
$$;

drop trigger if exists aff_module_offers        on offers;
drop trigger if exists aff_module_offer_metrics on offer_metrics;
drop trigger if exists aff_module_offer_rules   on offer_rules;
drop trigger if exists aff_module_tracked_links on tracked_links;
drop trigger if exists aff_module_site_pages    on site_pages;

create trigger aff_module_offers        before insert or update on offers
  for each row execute function enforce_brand_module('affiliate');
create trigger aff_module_offer_metrics before insert or update on offer_metrics
  for each row execute function enforce_brand_module('affiliate');
create trigger aff_module_offer_rules   before insert or update on offer_rules
  for each row execute function enforce_brand_module('affiliate');
create trigger aff_module_tracked_links before insert or update on tracked_links
  for each row execute function enforce_brand_module('affiliate');
create trigger aff_module_site_pages    before insert or update on site_pages
  for each row execute function enforce_brand_module('affiliate');

-- ----------------------------------------------------------------------------
-- 4. Public site functions: unchanged from 0003 and 0004 except for one added
--    condition, brand_has_module(b.id, 'affiliate'). CREATE OR REPLACE keeps
--    their existing grants to anon and authenticated.
-- ----------------------------------------------------------------------------
create or replace function public_brand(p_host text)
returns table (name text, domain text, tagline text, operator text, contact_email text)
language sql stable security definer set search_path = public as $$
  select b.name, b.domain,
         b.profile ->> 'tagline',
         b.profile ->> 'operator',
         b.profile ->> 'email'
  from brands b
  where b.domain = normalise_host(p_host)
    and brand_has_module(b.id, 'affiliate');
$$;

create or replace function public_pages(p_host text)
returns table (slug text, kind page_kind, title text, summary text, published_at timestamptz, sort_order integer)
language sql stable security definer set search_path = public as $$
  select p.slug, p.kind, p.published_title, p.published_summary, p.published_at,
         coalesce(t.sort_order, 0)
  from site_pages p
  join brands b on b.id = p.brand_id
  left join compliance_templates t on t.key = p.template_key
  where b.domain = normalise_host(p_host) and p.status = 'published'
    and brand_has_module(b.id, 'affiliate')
  order by p.kind, coalesce(t.sort_order, 0), p.published_at desc;
$$;

create or replace function public_page(p_host text, p_slug text)
returns table (slug text, kind page_kind, title text, summary text, body text, cta_link text)
language sql stable security definer set search_path = public as $$
  select p.slug, p.kind, p.published_title, p.published_summary, p.published_body,
         (select l.slug from tracked_links l
          where l.offer_id = p.offer_id and l.channel = 'site'
          order by l.created_at limit 1)
  from site_pages p
  join brands b on b.id = p.brand_id
  where b.domain = normalise_host(p_host) and p.slug = p_slug and p.status = 'published'
    and brand_has_module(b.id, 'affiliate');
$$;

create or replace function record_click(
  p_host         text,
  p_link         text,
  p_page         text default null,
  p_referrer_host text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  link   record;
  base   text;
  frag   text := '';
  result text;
begin
  select l.id, l.client_id, l.brand_id, l.offer_id, l.destination, l.tracking_code
    into link
  from tracked_links l
  join brands b on b.id = l.brand_id
  join offers  o on o.id = l.offer_id
  where b.domain = normalise_host(p_host)
    and l.slug   = p_link
    and o.status = 'approved'
    and brand_has_module(b.id, 'affiliate');

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
-- 5. Business type changes are logged (T-07, T-06).
-- ----------------------------------------------------------------------------
drop trigger if exists audit_brands_business_type on brands;
create trigger audit_brands_business_type
  after update of business_type on brands
  for each row
  when (old.business_type is distinct from new.business_type)
  execute function audit_row();

-- ----------------------------------------------------------------------------
-- 6. Test brands. AffiQube becomes AffilyVault; Famperia is added.
-- ----------------------------------------------------------------------------
do $$
declare
  vividha     constant uuid := '11111111-1111-4111-8111-111111111111';
  affilyvault constant uuid := '22222222-2222-4222-8222-222222222222';
  famperia    constant uuid := '33333333-3333-4333-8333-333333333333';
  clash       text;
begin
  if not exists (select 1 from clients where id = vividha) then
    raise notice 'Client Vividha Marketing not found; test brands skipped.';
    return;
  end if;

  select name into clash from brands where domain = 'affilyvault.com' and id <> affilyvault;
  if found then
    raise exception 'Stopped: the brand "%" already uses affilyvault.com. Change its domain, then run this file again.', clash;
  end if;
  select name into clash from brands where domain = 'famperia.com' and id <> famperia;
  if found then
    raise exception 'Stopped: the brand "%" already uses famperia.com. Change its domain, then run this file again.', clash;
  end if;

  -- AffiQube becomes AffilyVault. Its id, offers, links, settings and
  -- ClickBank connection stay. Created here if it was ever removed.
  insert into brands (id, client_id, name, domain, business_type, target_country)
  values (affilyvault, vividha, 'AffilyVault', 'affilyvault.com', 'affiliate', 'US')
  on conflict (id) do update
    set name = excluded.name, domain = excluded.domain, business_type = excluded.business_type;

  insert into brands (id, client_id, name, domain, business_type, niche, target_country)
  values (famperia, vividha, 'Famperia', 'famperia.com', 'dropshipping', 'Home decoration', 'US')
  on conflict (id) do nothing;

  -- Every action starts as approve-first (C-06).
  insert into approval_settings (brand_id, client_id, action, mode)
  select b, vividha, a, 'approve_first'
  from unnest(array[affilyvault, famperia]) as b,
       unnest(enum_range(null::action_type)) as a
  on conflict (brand_id, action) do nothing;
end $$;
