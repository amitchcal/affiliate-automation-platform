-- =============================================================================
-- Results module tests. Run after 0001_core.sql, 0003_site.sql, and
-- 0004_results.sql on a scratch database.
-- Tests: tracking_code auto-generation, tid URL construction (append,
-- replace, fragment), no-duplicate import (unique constraint + ON CONFLICT
-- DO NOTHING), and network_sales RLS.
-- P-01, P-03
-- =============================================================================
\set ON_ERROR_STOP on

-- ---------- seed (as superuser, bypassing RLS) ----------
insert into clients (id, name) values
  ('cccccccc-0000-0000-0000-000000000000', 'Client C'),
  ('dddddddd-0000-0000-0000-000000000000', 'Client D');
insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000c0', null,                                   'owner'),
  ('00000000-0000-0000-0000-0000000000c2', 'cccccccc-0000-0000-0000-000000000000', 'client_viewer'),
  ('00000000-0000-0000-0000-0000000000d1', 'dddddddd-0000-0000-0000-000000000000', 'client_admin');
insert into brands (id, client_id, name, domain) values
  ('cccccccc-1111-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000000', 'Brand C', 'brand-c.test'),
  ('dddddddd-1111-0000-0000-000000000000', 'dddddddd-0000-0000-0000-000000000000', 'Brand D', 'brand-d.test');
insert into offers (id, client_id, brand_id, name, network) values
  ('cccccccc-2222-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000000',
   'cccccccc-1111-0000-0000-000000000000', 'Offer C', 'clickbank');
insert into offer_rules (offer_id, client_id, compliance_risk, seller_restrictions, approved)
  values ('cccccccc-2222-0000-0000-000000000000', 'cccccccc-0000-0000-0000-000000000000',
          'low', 'low', true);
update offers set status = 'approved' where id = 'cccccccc-2222-0000-0000-000000000000';
insert into tracked_links (id, client_id, brand_id, offer_id, slug, destination, channel)
  values ('cccccccc-4444-0000-0000-000000000000',
          'cccccccc-0000-0000-0000-000000000000',
          'cccccccc-1111-0000-0000-000000000000',
          'cccccccc-2222-0000-0000-000000000000',
          'offer-c', 'https://seller.test/hop', 'site');

create or replace function test_login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end;
$$;

begin;
select test_login('00000000-0000-0000-0000-0000000000c0');

-- ---------- tracking_code: auto-generated, 8 lowercase hex chars ----------
do $$
declare code text;
begin
  select tracking_code into code
    from tracked_links where id = 'cccccccc-4444-0000-0000-000000000000';
  if length(code) <> 8 then
    raise exception 'P-01: tracking_code is not 8 characters (got %)', length(code);
  end if;
  if code ~ '[^0-9a-f]' then
    raise exception 'P-01: tracking_code contains non-hex characters: %', code;
  end if;
end $$;

-- ---------- record_click: ?tid= appended when destination has no query string ----------
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare dest text; tid_val text;
begin
  dest    := record_click('brand-c.test', 'offer-c');
  tid_val := substring(dest from '[?&]tid=([^&#]+)');
  if tid_val is null then
    raise exception 'P-01: no tid parameter in destination (got %)', dest;
  end if;
  if length(tid_val) <> 8 or tid_val ~ '[^0-9a-f]' then
    raise exception 'P-01: tid is not 8 lowercase hex chars (got %)', tid_val;
  end if;
  if dest <> 'https://seller.test/hop?tid=' || tid_val then
    raise exception 'P-01: unexpected destination format (got %)', dest;
  end if;
end $$;

-- ---------- record_click: existing tid= is replaced, not duplicated ----------
select test_login('00000000-0000-0000-0000-0000000000c0');
update tracked_links
  set destination = 'https://seller.test/hop?tid=oldcode&x=1'
  where id = 'cccccccc-4444-0000-0000-000000000000';

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare dest text; tid_val text;
begin
  dest    := record_click('brand-c.test', 'offer-c');
  tid_val := substring(dest from '[?&]tid=([^&#]+)');
  if dest like '%oldcode%' then
    raise exception 'P-01: old tid value was not replaced (got %)', dest;
  end if;
  -- No second tid= occurrence.
  if (length(dest) - length(replace(dest, 'tid=', ''))) > 4 then
    raise exception 'P-01: tid parameter appears more than once (got %)', dest;
  end if;
  if dest not like '%&x=1' then
    raise exception 'P-01: unrelated query parameter was dropped (got %)', dest;
  end if;
  if length(tid_val) <> 8 or tid_val ~ '[^0-9a-f]' then
    raise exception 'P-01: replaced tid is not 8 hex chars (got %)', tid_val;
  end if;
end $$;

-- ---------- record_click: URL fragment preserved after tid ----------
select test_login('00000000-0000-0000-0000-0000000000c0');
update tracked_links
  set destination = 'https://seller.test/hop#section'
  where id = 'cccccccc-4444-0000-0000-000000000000';

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare dest text; tid_val text;
begin
  dest    := record_click('brand-c.test', 'offer-c');
  tid_val := substring(dest from '[?&]tid=([^&#]+)');
  if tid_val is null or length(tid_val) <> 8 then
    raise exception 'P-01: tid missing or wrong length with fragment (got %)', dest;
  end if;
  if dest not like '%?tid=' || tid_val || '#section' then
    raise exception 'P-01: fragment not preserved correctly (got %)', dest;
  end if;
  if dest like '%#%?%' then
    raise exception 'P-01: query parameter appears after fragment (got %)', dest;
  end if;
end $$;

-- Reset destination for import tests.
select test_login('00000000-0000-0000-0000-0000000000c0');
update tracked_links
  set destination = 'https://seller.test/hop'
  where id = 'cccccccc-4444-0000-0000-000000000000';

-- ---------- no-duplicate import ----------
do $$
declare cnt integer;
begin
  insert into network_sales
    (client_id, brand_id, offer_id, link_id, network, order_ref, transaction_type,
     sale_date, commission, gross_sale, vendor, product_title, tracking_id)
  values
    ('cccccccc-0000-0000-0000-000000000000',
     'cccccccc-1111-0000-0000-000000000000',
     'cccccccc-2222-0000-0000-000000000000',
     'cccccccc-4444-0000-0000-000000000000',
     'clickbank', 'TESTRCPT01', 'sale',
     now(), 21.00, 42.00, 'seller', 'Offer C', 'abc12345');

  -- Raw duplicate must be rejected by the unique constraint.
  begin
    insert into network_sales
      (client_id, brand_id, offer_id, link_id, network, order_ref, transaction_type,
       sale_date, commission, gross_sale, vendor, product_title, tracking_id)
    values
      ('cccccccc-0000-0000-0000-000000000000',
       'cccccccc-1111-0000-0000-000000000000',
       'cccccccc-2222-0000-0000-000000000000',
       'cccccccc-4444-0000-0000-000000000000',
       'clickbank', 'TESTRCPT01', 'sale',
       now(), 21.00, 42.00, 'seller', 'Offer C', 'abc12345');
    raise exception 'P-01: duplicate insert was accepted by the unique constraint';
  exception when unique_violation then null;
  end;

  -- ON CONFLICT DO NOTHING must silently skip the same row.
  insert into network_sales
    (client_id, brand_id, offer_id, link_id, network, order_ref, transaction_type,
     sale_date, commission, gross_sale, vendor, product_title, tracking_id)
  values
    ('cccccccc-0000-0000-0000-000000000000',
     'cccccccc-1111-0000-0000-000000000000',
     'cccccccc-2222-0000-0000-000000000000',
     'cccccccc-4444-0000-0000-000000000000',
     'clickbank', 'TESTRCPT01', 'sale',
     now(), 21.00, 42.00, 'seller', 'Offer C', 'abc12345')
  on conflict (network, order_ref, transaction_type, sale_date) do nothing;

  select count(*) into cnt from network_sales where order_ref = 'TESTRCPT01';
  if cnt <> 1 then
    raise exception 'P-01: expected 1 row after ON CONFLICT DO NOTHING, found %', cnt;
  end if;

  -- A refund for the same receipt is a different transaction_type and must be accepted.
  insert into network_sales
    (client_id, brand_id, offer_id, link_id, network, order_ref, transaction_type,
     sale_date, commission, gross_sale, vendor, product_title, tracking_id)
  values
    ('cccccccc-0000-0000-0000-000000000000',
     'cccccccc-1111-0000-0000-000000000000',
     'cccccccc-2222-0000-0000-000000000000',
     'cccccccc-4444-0000-0000-000000000000',
     'clickbank', 'TESTRCPT01', 'refund',
     now(), -21.00, null, 'seller', 'Offer C', 'abc12345');

  select count(*) into cnt from network_sales where order_ref = 'TESTRCPT01';
  if cnt <> 2 then
    raise exception 'P-01: expected 2 rows (sale + refund), found %', cnt;
  end if;

  -- Two monthly rebills on the same receipt are different transactions and both kept.
  insert into network_sales
    (client_id, network, order_ref, transaction_type, sale_date, commission)
  values
    ('cccccccc-0000-0000-0000-000000000000', 'clickbank', 'TESTRCPT02', 'rebill',
     '2026-08-01 10:00+00', 9.00),
    ('cccccccc-0000-0000-0000-000000000000', 'clickbank', 'TESTRCPT02', 'rebill',
     '2026-09-01 10:00+00', 9.00);
  select count(*) into cnt from network_sales where order_ref = 'TESTRCPT02';
  if cnt <> 2 then
    raise exception 'P-01: second rebill on the same receipt was not kept (found %)', cnt;
  end if;

  -- An unmatched sale is stored at client level with no brand.
  insert into network_sales
    (client_id, network, order_ref, transaction_type, sale_date, commission, tracking_id)
  values
    ('cccccccc-0000-0000-0000-000000000000', 'clickbank', 'TESTRCPT03', 'sale',
     now(), 5.00, 'nomatch1');
end $$;

-- ---------- the server's ClickBank key belongs to one client only ----------
do $$
begin
  insert into connections (client_id, brand_id, provider, account_ref, secret_ref)
  values ('cccccccc-0000-0000-0000-000000000000', 'cccccccc-1111-0000-0000-000000000000',
          'clickbank', 'nick-c', 'env:CLICKBANK_API_KEY');
  begin
    insert into connections (client_id, brand_id, provider, account_ref, secret_ref)
    values ('dddddddd-0000-0000-0000-000000000000', 'dddddddd-1111-0000-0000-000000000000',
            'clickbank', 'nick-d', 'env:CLICKBANK_API_KEY');
    raise exception 'P-01: the server key was attached to a second client';
  exception when unique_violation then null;
  end;

  -- C-05: a second client may still hold its own ClickBank connection with its own key.
  insert into connections (client_id, brand_id, provider, account_ref, secret_ref)
  values ('dddddddd-0000-0000-0000-000000000000', 'dddddddd-1111-0000-0000-000000000000',
          'clickbank', 'nick-d', 'vault/clickbank-d');
  if (select count(*) from connections where provider = 'clickbank') <> 2 then
    raise exception 'C-05: a second client could not hold its own ClickBank connection';
  end if;
end $$;

-- ---------- RLS: client C viewer reads own; client D reads nothing ----------
select test_login('00000000-0000-0000-0000-0000000000c2');
do $$
declare cnt integer;
begin
  select count(*) into cnt from network_sales
    where client_id = 'cccccccc-0000-0000-0000-000000000000';
  if cnt <> 5 then
    raise exception 'P-03: client C viewer cannot read own sales (found %)', cnt;
  end if;
  -- Client roles cannot see the connection, so the import is refused for them.
  if (select count(*) from connections) <> 0 then
    raise exception 'P-01: a client viewer can see the ClickBank connection';
  end if;
  -- And cannot write sales.
  begin
    insert into network_sales (client_id, network, order_ref, transaction_type, sale_date, commission)
    values ('cccccccc-0000-0000-0000-000000000000', 'clickbank', 'VIEWERWRITE', 'sale', now(), 1);
    raise exception 'T-02: a client viewer wrote a sale';
  exception when insufficient_privilege then null;
  end;
end $$;

select test_login('00000000-0000-0000-0000-0000000000d1');
do $$
declare cnt integer;
begin
  select count(*) into cnt from network_sales
    where client_id = 'cccccccc-0000-0000-0000-000000000000';
  if cnt <> 0 then
    raise exception 'T-02: client D can read client C sales (found %)', cnt;
  end if;
end $$;

rollback;

\echo 'ALL RESULTS RULE TESTS PASSED'
