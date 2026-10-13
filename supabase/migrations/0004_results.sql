-- =============================================================================
-- Marketing Automation Platform: results module
-- Slice 1, increment 4. Run after 0001_core.sql, 0002_seed_first_client.sql,
-- and 0003_site.sql.
--
-- Adds tracking_code to tracked_links, replaces record_click to append the
-- ClickBank tid parameter to every outbound redirect, creates network_sales
-- for imported orders, and records which client owns the ClickBank key.
-- Safe to run more than once. Existing tracked links get a code; no other
-- existing rows change.
-- P-01, P-02, P-03
-- =============================================================================

-- ----------------------------------------------------------------------------
-- tracking_code on tracked_links (P-01).
-- 8 lowercase hex characters; no hyphens (ClickBank forbids them in tid).
-- Globally unique so one ClickBank account covers all brands under a client.
-- The DEFAULT is set here; existing rows are backfilled before NOT NULL.
-- ----------------------------------------------------------------------------
alter table tracked_links
  add column if not exists tracking_code text;

update tracked_links
  set tracking_code = encode(gen_random_bytes(4), 'hex')
  where tracking_code is null;

alter table tracked_links
  alter column tracking_code set not null,
  alter column tracking_code set default encode(gen_random_bytes(4), 'hex');

create unique index if not exists tracked_links_tracking_code_idx
  on tracked_links (tracking_code);

-- ----------------------------------------------------------------------------
-- Replace record_click (P-01).
-- The outbound destination now carries ?tid=<tracking_code> so ClickBank
-- records the code with each sale. Rules:
--   * If the destination already has a tid= parameter, replace its value.
--   * If the URL has a query string but no tid=, append &tid=.
--   * If there is no query string, append ?tid=.
--   * A URL fragment (#...) is always preserved at the very end.
-- ----------------------------------------------------------------------------
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
    and o.status = 'approved';

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
-- network_sales: one row per ClickBank transaction (P-01).
-- A transaction is identified by receipt, type, and time, so repeated rebills
-- on one receipt are kept as separate rows while a re-import of the same
-- transaction is skipped.
-- brand_id is null when the tracking code matched no known link — those rows
-- are stored at client level and shown separately from any brand's dashboard.
-- commission stores the raw API value; it may be negative for refunds.
-- No customer PII: name, email, address, and postal code are never stored.
-- ----------------------------------------------------------------------------
create table if not exists network_sales (
  id               uuid        primary key default gen_random_uuid(),
  client_id        uuid        not null references clients (id) on delete cascade,
  brand_id         uuid        references brands        (id) on delete set null,
  offer_id         uuid        references offers        (id) on delete set null,
  link_id          uuid        references tracked_links (id) on delete set null,
  network          text        not null,
  order_ref        text        not null,
  transaction_type text        not null
    check (transaction_type in ('sale', 'refund', 'chargeback', 'rebill', 'fee')),
  is_test          boolean     not null default false,
  sale_date        timestamptz not null,
  commission       numeric     not null,
  gross_sale       numeric,
  vendor           text,
  product_title    text,
  tracking_id      text,
  imported_at      timestamptz not null default now(),
  constraint network_sales_transaction_key
    unique (network, order_ref, transaction_type, sale_date)
);
create index if not exists network_sales_client_idx on network_sales (client_id, sale_date desc);
create index if not exists network_sales_brand_idx  on network_sales (brand_id,  sale_date desc)
  where brand_id is not null;

-- ----------------------------------------------------------------------------
-- Row-level security (T-02).
-- Reads: any member of the client. Writes: owner and operators only.
-- The import action runs as the authenticated owner, so no service role key
-- is needed for this increment.
-- ----------------------------------------------------------------------------
alter table network_sales enable row level security;

drop policy if exists sales_read  on network_sales;
drop policy if exists sales_write on network_sales;
create policy sales_read on network_sales
  for select using (has_client_access(client_id));
create policy sales_write on network_sales
  for all using (can_manage(client_id)) with check (can_manage(client_id));

-- ----------------------------------------------------------------------------
-- Which client owns the ClickBank key in the server environment (P-01, C-05).
-- The key itself lives in CLICKBANK_API_KEY, never in the database. The
-- connection row marked secret_ref = 'env:CLICKBANK_API_KEY' says whose
-- account it is, and the import refuses any client without that row.
-- Each environment key may be named by only one connection row, so the
-- owner's key can never be attached to a second client by mistake. Rows whose
-- secret_ref is not 'env:...' (a client's own vault key, C-05) are not limited.
-- Temporary: per-brand vault references replace this when C-05 is built.
-- ----------------------------------------------------------------------------
create unique index if not exists connections_env_key_idx
  on connections (provider, secret_ref)
  where secret_ref like 'env:%';

insert into connections (client_id, brand_id, provider, account_ref, secret_ref)
select b.client_id, b.id, 'clickbank', 'vividham', 'env:CLICKBANK_API_KEY'
from brands b
where b.id = '22222222-2222-4222-8222-222222222222'   -- AffiQube, from 0002
  and not exists (
    select 1 from connections c
    where c.provider = 'clickbank' and c.secret_ref = 'env:CLICKBANK_API_KEY'
  );

-- Verify with supabase/verify_results.sql after applying.
