-- =============================================================================
-- Client-consistency tests (0006). Run after 0001 to 0006 against a scratch
-- database. Each block rolls back. Every mismatched row must be refused by a
-- foreign key or check constraint; any other error fails the run, so a
-- refusal that comes from some other rule cannot hide a missing constraint.
--
-- Users
--   owner       00000000-0000-0000-0000-0000000000a0
--   a_operator  ...a3   operator of client A
-- =============================================================================
\set ON_ERROR_STOP on

-- ---------- seed (as superuser): two clients, each with a full chain ----------
insert into clients (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Client B');

insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', null, 'owner'),
  ('00000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'operator');

insert into brands (id, client_id, name, domain) values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A', 'brand-a.test'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'Brand B', 'brand-b.test');

-- Offer A1 and B1 approved (each needs an approved rules record); B2 has no rules record.
insert into offers (id, client_id, brand_id, name, network) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'Offer A1', 'clickbank'),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000', 'Offer B1', 'clickbank'),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000', 'Offer B2', 'clickbank');
insert into offer_rules (offer_id, client_id, approved) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', true),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', true);
update offers set status = 'approved'
  where id in ('aaaaaaaa-2222-0000-0000-000000000001', 'bbbbbbbb-2222-0000-0000-000000000001');

insert into tracked_links (id, client_id, brand_id, offer_id, slug, destination, channel) values
  ('aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000',
   'aaaaaaaa-2222-0000-0000-000000000001', 'a1', 'https://a.test', 'site'),
  ('bbbbbbbb-3333-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000',
   'bbbbbbbb-2222-0000-0000-000000000001', 'b1', 'https://b.test', 'site');

insert into click_events (client_id, brand_id, link_id, offer_id) values
  ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000',
   'bbbbbbbb-3333-0000-0000-000000000000', 'bbbbbbbb-2222-0000-0000-000000000001');

insert into network_sales (id, client_id, brand_id, offer_id, link_id, network, order_ref, transaction_type, sale_date, commission) values
  ('bbbbbbbb-4444-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000',
   'bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-3333-0000-0000-000000000000', 'clickbank', 'R-1', 'sale', now(), 10);

-- Helper: the statement must fail with a foreign key or check violation.
create or replace function expect_mismatch_refused(label text, stmt text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when foreign_key_violation or check_violation then
    return;
  end;
  raise exception '%: a row with a mismatched client was accepted', label;
end;
$$;

-- Helper: act as a signed-in user for the rest of the transaction.
create or replace function test_login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end;
$$;
grant execute on function expect_mismatch_refused(text, text) to authenticated;

-- ---------- The scenario from the review: an operator of A writes a rules record for B's offer ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a3');
select expect_mismatch_refused('offer_rules_offer_client_match (operator of A, offer of B)',
  $$insert into offer_rules (offer_id, client_id, approved)
    values ('bbbbbbbb-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', true)$$);
rollback;

-- The same operator can still write a rules record for an offer of their own client.
begin;
insert into offers (id, client_id, brand_id, name, network) values
  ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'Offer A2', 'clickbank');
select test_login('00000000-0000-0000-0000-0000000000a3');
insert into offer_rules (offer_id, client_id) values
  ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000');
rollback;

-- ---------- One refusal per constraint (as superuser, so no policy is involved) ----------
begin;
select expect_mismatch_refused('offers_brand_client_match',
  $$insert into offers (client_id, brand_id, name, network)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000', 'X', 'clickbank')$$);

select expect_mismatch_refused('offer_metrics_offer_client_match',
  $$insert into offer_metrics (offer_id, client_id, payout)
    values ('bbbbbbbb-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 1)$$);

select expect_mismatch_refused('offer_rules_offer_client_match',
  $$insert into offer_rules (offer_id, client_id)
    values ('bbbbbbbb-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000')$$);

select expect_mismatch_refused('tracked_links_offer_brand_client_match (offer of another client)',
  $$insert into tracked_links (client_id, brand_id, offer_id, slug, destination, channel)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000',
            'bbbbbbbb-2222-0000-0000-000000000001', 'x', 'https://x.test', 'site')$$);

select expect_mismatch_refused('site_pages_brand_client_match',
  $$insert into site_pages (client_id, brand_id, kind, slug, title)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000', 'article', 'x', 'X')$$);

select expect_mismatch_refused('site_pages_offer_brand_client_match',
  $$insert into site_pages (client_id, brand_id, kind, slug, title, offer_id)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'offer', 'x', 'X',
            'bbbbbbbb-2222-0000-0000-000000000001')$$);

select expect_mismatch_refused('click_events_link_match',
  $$insert into click_events (client_id, brand_id, link_id, offer_id)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000',
            'bbbbbbbb-3333-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-000000000001')$$);

select expect_mismatch_refused('network_sales_brand_client_match',
  $$insert into network_sales (client_id, brand_id, network, order_ref, transaction_type, sale_date, commission)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000', 'clickbank', 'X-1', 'sale', now(), 1)$$);

select expect_mismatch_refused('network_sales_offer_client_match',
  $$insert into network_sales (client_id, offer_id, network, order_ref, transaction_type, sale_date, commission)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-2222-0000-0000-000000000001', 'clickbank', 'X-2', 'sale', now(), 1)$$);

select expect_mismatch_refused('network_sales_link_client_match',
  $$insert into network_sales (client_id, link_id, network, order_ref, transaction_type, sale_date, commission)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-3333-0000-0000-000000000000', 'clickbank', 'X-3', 'sale', now(), 1)$$);

select expect_mismatch_refused('connections_brand_client_match',
  $$insert into connections (client_id, brand_id, provider, account_ref)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000', 'clickbank', 'x')$$);

select expect_mismatch_refused('approval_settings_brand_client_match',
  $$insert into approval_settings (brand_id, client_id, action)
    values ('bbbbbbbb-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'publish_page')$$);

select expect_mismatch_refused('scoring_configs_brand_client_match',
  $$insert into scoring_configs (client_id, brand_id, weights, scales, expected_cost_per_click)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000', '{"epc":100}', '{}', 0.8)$$);

select expect_mismatch_refused('scoring_configs_brand_needs_client_match',
  $$insert into scoring_configs (client_id, brand_id, weights, scales, expected_cost_per_click)
    values (null, 'bbbbbbbb-1111-0000-0000-000000000000', '{"epc":100}', '{}', 0.8)$$);

-- Changing a row's client after the fact is refused too, not only inserts.
select expect_mismatch_refused('offers_brand_client_match (update)',
  $$update offers set client_id = 'aaaaaaaa-0000-0000-0000-000000000000'
    where id = 'bbbbbbbb-2222-0000-0000-000000000002'$$);
rollback;

-- ---------- Deletes behave as before ----------
begin;
delete from tracked_links where id = 'bbbbbbbb-3333-0000-0000-000000000000';
do $$
begin
  if not exists (select 1 from network_sales
                 where id = 'bbbbbbbb-4444-0000-0000-000000000000'
                   and link_id is null and client_id = 'bbbbbbbb-0000-0000-0000-000000000000'
                   and brand_id is not null and offer_id is not null) then
    raise exception 'deleting a link must clear only the sale''s link_id';
  end if;
  if exists (select 1 from click_events where link_id = 'bbbbbbbb-3333-0000-0000-000000000000') then
    raise exception 'deleting a link must delete its clicks';
  end if;
end $$;
rollback;

begin;
delete from offers where id = 'bbbbbbbb-2222-0000-0000-000000000001';
do $$
begin
  if not exists (select 1 from network_sales
                 where id = 'bbbbbbbb-4444-0000-0000-000000000000'
                   and offer_id is null and link_id is null
                   and client_id = 'bbbbbbbb-0000-0000-0000-000000000000' and brand_id is not null) then
    raise exception 'deleting an offer must keep the sale and its client';
  end if;
end $$;
rollback;

begin;
delete from brands where id = 'bbbbbbbb-1111-0000-0000-000000000000';
do $$
begin
  if not exists (select 1 from network_sales
                 where id = 'bbbbbbbb-4444-0000-0000-000000000000'
                   and brand_id is null and offer_id is null and link_id is null
                   and client_id = 'bbbbbbbb-0000-0000-0000-000000000000') then
    raise exception 'deleting a brand must keep the sale at client level';
  end if;
  if exists (select 1 from offers where brand_id = 'bbbbbbbb-1111-0000-0000-000000000000') then
    raise exception 'deleting a brand must delete its offers';
  end if;
end $$;
rollback;

begin;
delete from clients where id = 'bbbbbbbb-0000-0000-0000-000000000000';
do $$
begin
  if exists (select 1 from network_sales where client_id = 'bbbbbbbb-0000-0000-0000-000000000000') then
    raise exception 'deleting a client must delete its sales';
  end if;
end $$;
rollback;

-- ---------- Visitors cannot call brand_has_module ----------
do $$
begin
  if has_function_privilege('anon', 'brand_has_module(uuid, text)', 'execute') then
    raise exception 'anon can still call brand_has_module';
  end if;
end $$;

\echo 'ALL CONSISTENCY RULE TESTS PASSED'
