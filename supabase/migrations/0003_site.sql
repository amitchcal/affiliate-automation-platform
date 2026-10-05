-- =============================================================================
-- Marketing Automation Platform: site module
-- Slice 1, increment 3. Run after 0001_core.sql and 0002_seed_first_client.sql.
-- Safe to run once; it creates new objects only.
--
-- Public visitors are never given table access. They read through the
-- public_* functions at the end of this file, which return published content
-- only (T-02).
-- =============================================================================

create type page_kind as enum ('standard', 'offer', 'article');
create type page_status as enum ('draft', 'published');

-- ----------------------------------------------------------------------------
-- Compliance templates (C-04). One platform-wide set, copied into each site.
-- Placeholders: {{brand}} {{domain}} {{operator}} {{address}} {{email}}
-- ----------------------------------------------------------------------------
create table compliance_templates (
  key text primary key,
  title text not null,
  body text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into compliance_templates (key, title, sort_order, body) values
('affiliate-disclosure', 'Affiliate Disclosure', 1,
$md${{brand}} publishes overviews of products sold by other companies. This page explains how the site earns money and how to read its content.

## We earn commissions

Some links on this site are affiliate links. If you click one and make a purchase, {{brand}} may receive a commission from the seller. This does not change the price you pay.

Each page that contains affiliate links says so at the top of the page and next to the links.

## How to read our overviews

- Unless a page states that we used a product ourselves, our overviews are based on information published by the product's creator.
- We do not publish customer testimonials or ratings that we cannot verify.
- We describe who a product suits and who it does not, so you can decide for yourself.

## Your purchase

You buy from the seller, not from {{brand}}. The seller sets the price, delivers the product, and handles refunds under its own terms. Please read those terms before you buy.

## Not professional advice

Content on this site is general information. It is not professional advice.

## Contact

Questions about this disclosure can be sent to {{email}}.$md$),

('privacy', 'Privacy Policy', 2,
$md$This policy explains what information {{brand}} collects when you visit {{domain}}, and what we do with it. The site is operated by {{operator}}.

## What we collect

- **Clicks on product links.** When you click a link to a seller, we record which link was clicked, the page it was on, and the time. We do not record your name, email address, or IP address with the click.
- **Your email address, if you give it to us.** Only when you write to us or sign up for updates.

## What sellers and networks collect

When you follow a link to a seller's website, the seller and its affiliate network may place a cookie in your browser so that a purchase can be credited to us. Their own privacy policies apply to that information.

## What we do not do

We do not sell personal information, and we do not knowingly collect information from children under 13. This site is intended for adults.

## Your choices

You can ask us what information we hold about you, or ask us to delete it, by writing to {{email}}.

## Contact

{{operator}}
{{address}}
{{email}}$md$),

('terms', 'Terms of Use', 3,
$md$These terms apply to your use of {{domain}}, operated by {{operator}}. By using the site you agree to them.

## What this site is

{{brand}} publishes general information about products sold by other companies. We do not sell products, take payments, or deliver anything.

## Purchases

Any purchase you make after following a link is made with the seller, under the seller's terms. The seller is responsible for the product, its delivery, and refunds. {{brand}} is not a party to that purchase.

## Affiliate links

Some links earn us a commission. See our Affiliate Disclosure for details.

## Accuracy

We describe products using information published by their sellers and try to keep it current. Sellers can change their products, prices, and terms at any time, so confirm the details on the seller's site before you buy.

## No professional advice

Content on this site is general information and is not professional advice.

## Our content

The text and design of this site belong to {{operator}}. Product names and trademarks belong to their owners.

## Liability

To the extent the law allows, {{operator}} is not liable for losses arising from your use of this site or from products bought from sellers.

## Changes

We may update these terms. The current version is always on this page.

## Contact

{{operator}}
{{address}}
{{email}}$md$),

('contact', 'Contact', 4,
$md$You can reach {{brand}} at {{email}}.

## About orders

We do not sell products directly. For questions about an order, a delivery, or a refund, contact the seller using the details in your order confirmation email.

## Operated by

{{operator}}
{{address}}$md$);

-- ----------------------------------------------------------------------------
-- Site pages (S-03). The draft fields are what editors and agents change;
-- the published_* fields are what visitors see. Publishing copies one to the other.
-- ----------------------------------------------------------------------------
create table site_pages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  brand_id uuid not null references brands (id) on delete cascade,
  kind page_kind not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  summary text not null default '',
  draft_body text not null default '',
  status page_status not null default 'draft',
  published_title text,
  published_summary text,
  published_body text,
  published_at timestamptz,
  published_by uuid,
  offer_id uuid references offers (id) on delete cascade,
  template_key text references compliance_templates (key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug),
  constraint offer_pages_have_an_offer check ((kind = 'offer') = (offer_id is not null)),
  constraint reserved_slug check (slug <> 'go')
);
create index site_pages_brand_idx on site_pages (brand_id, status);

-- Publishing rules, enforced for people and agents alike.
--   O-05: an offer page needs an approved offer.
--   S-04: an offer page or article needs all standard pages published first.
create function enforce_page_publish() returns trigger
language plpgsql as $$
declare
  missing_standard integer;
begin
  new.updated_at := now();

  if new.status = 'published' and (
       old.status is distinct from 'published'
       or new.published_body is distinct from old.published_body
       or new.published_title is distinct from old.published_title
  ) then
    if coalesce(new.published_body, '') = '' then
      raise exception 'A page cannot be published with no content.';
    end if;

    if new.kind = 'offer' and not exists (
      select 1 from offers where id = new.offer_id and status = 'approved'
    ) then
      raise exception 'This page cannot be published: its offer is not approved.';
    end if;

    if new.kind in ('offer', 'article') then
      select count(*) into missing_standard
      from compliance_templates t
      where not exists (
        select 1 from site_pages p
        where p.brand_id = new.brand_id and p.template_key = t.key and p.status = 'published'
      );
      if missing_standard > 0 then
        raise exception 'This page cannot be published: % standard page(s) are not published yet.', missing_standard;
      end if;
    end if;

    new.published_at := now();
    new.published_by := coalesce(auth.uid(), new.published_by);
  end if;
  return new;
end;
$$;
create trigger site_pages_enforce_publish
  before update on site_pages
  for each row execute function enforce_page_publish();

-- Publishing and unpublishing are written to the audit log (S-03, T-06).
create trigger audit_site_pages
  after update on site_pages
  for each row
  when (old.status is distinct from new.status
        or old.published_body is distinct from new.published_body)
  execute function audit_row();

-- ----------------------------------------------------------------------------
-- Click recording (S-07). No personal data is stored with a click.
-- ----------------------------------------------------------------------------
create table click_events (
  id bigint generated always as identity primary key,
  client_id uuid not null references clients (id) on delete cascade,
  brand_id uuid not null references brands (id) on delete cascade,
  link_id uuid not null references tracked_links (id) on delete cascade,
  offer_id uuid not null references offers (id) on delete cascade,
  page_slug text,
  referrer_host text,
  created_at timestamptz not null default now()
);
create index click_events_link_idx on click_events (link_id, created_at desc);
create index click_events_brand_idx on click_events (brand_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Row-level security
-- ----------------------------------------------------------------------------
alter table compliance_templates enable row level security;
alter table site_pages enable row level security;
alter table click_events enable row level security;

create policy templates_read on compliance_templates for select using (auth.uid() is not null);
create policy templates_write on compliance_templates for all using (is_owner()) with check (is_owner());

create policy pages_read on site_pages for select using (has_client_access(client_id));
create policy pages_write on site_pages for all using (can_manage(client_id)) with check (can_manage(client_id));

-- Clicks are readable by the client's members and written only by record_click().
create policy clicks_read on click_events for select using (has_client_access(client_id));

-- ----------------------------------------------------------------------------
-- Public read functions. SECURITY DEFINER, returning published content only.
-- ----------------------------------------------------------------------------
create function normalise_host(p_host text) returns text
language sql immutable as $$
  select regexp_replace(lower(split_part(coalesce(p_host, ''), ':', 1)), '^www\.', '');
$$;

-- The brand behind a domain, with only the fields a visitor may see (S-01).
create function public_brand(p_host text)
returns table (name text, domain text, tagline text, operator text, contact_email text)
language sql stable security definer set search_path = public as $$
  select b.name, b.domain,
         b.profile ->> 'tagline',
         b.profile ->> 'operator',
         b.profile ->> 'email'
  from brands b
  where b.domain = normalise_host(p_host);
$$;

-- Every published page of a brand, for the home page and the footer (S-05).
create function public_pages(p_host text)
returns table (slug text, kind page_kind, title text, summary text, published_at timestamptz, sort_order integer)
language sql stable security definer set search_path = public as $$
  select p.slug, p.kind, p.published_title, p.published_summary, p.published_at,
         coalesce(t.sort_order, 0)
  from site_pages p
  join brands b on b.id = p.brand_id
  left join compliance_templates t on t.key = p.template_key
  where b.domain = normalise_host(p_host) and p.status = 'published'
  order by p.kind, coalesce(t.sort_order, 0), p.published_at desc;
$$;

-- One published page. cta_link is the slug of the offer's site link, if any.
create function public_page(p_host text, p_slug text)
returns table (slug text, kind page_kind, title text, summary text, body text, cta_link text)
language sql stable security definer set search_path = public as $$
  select p.slug, p.kind, p.published_title, p.published_summary, p.published_body,
         (select l.slug from tracked_links l
          where l.offer_id = p.offer_id and l.channel = 'site'
          order by l.created_at limit 1)
  from site_pages p
  join brands b on b.id = p.brand_id
  where b.domain = normalise_host(p_host) and p.slug = p_slug and p.status = 'published';
$$;

-- Records a click and returns where to send the visitor (S-07).
-- Returns null when the link does not exist or its offer is no longer approved.
create function record_click(p_host text, p_link text, p_page text default null, p_referrer_host text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  link record;
begin
  select l.id, l.client_id, l.brand_id, l.offer_id, l.destination
    into link
  from tracked_links l
  join brands b on b.id = l.brand_id
  join offers o on o.id = l.offer_id
  where b.domain = normalise_host(p_host) and l.slug = p_link and o.status = 'approved';

  if not found then
    return null;
  end if;

  insert into click_events (client_id, brand_id, link_id, offer_id, page_slug, referrer_host)
  values (link.client_id, link.brand_id, link.id, link.offer_id,
          nullif(left(p_page, 200), ''), nullif(left(p_referrer_host, 200), ''));

  return link.destination;
end;
$$;

-- Supabase exposes functions to every role by default. Make the intent explicit:
-- visitors may call only these four.
revoke execute on function public_brand(text) from public;
revoke execute on function public_pages(text) from public;
revoke execute on function public_page(text, text) from public;
revoke execute on function record_click(text, text, text, text) from public;
grant execute on function public_brand(text) to anon, authenticated;
grant execute on function public_pages(text) to anon, authenticated;
grant execute on function public_page(text, text) to anon, authenticated;
grant execute on function record_click(text, text, text, text) to anon, authenticated;

-- A brand has at most one page per template.
create unique index site_pages_template_idx on site_pages (brand_id, template_key)
  where template_key is not null;
