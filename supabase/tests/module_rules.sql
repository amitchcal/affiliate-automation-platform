-- =============================================================================
-- Module entitlement tests (T-07, migration 0005). Run after 0001 to 0006
-- against a scratch database.
--
-- Users
--   owner       00000000-0000-0000-0000-0000000000a0
--   a_admin     ...a1   client admin of client A
--   a_operator  ...a3   operator of client A
--
-- Brands of client A
--   aff     ...1111  affiliate
--   drop    ...1112  dropshipping
--   both    ...1113  both
--   switch  ...1114  affiliate with an offer, link and published page; then switched to dropshipping
-- Brand of client B
--   b_drop  bbbb...1112  dropshipping
-- =============================================================================
\set ON_ERROR_STOP on

-- ---------- seed (as superuser) ----------
insert into clients (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Client B');

insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', null, 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_admin'),
  ('00000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'operator');

insert into brands (id, client_id, name, domain, business_type) values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Aff Brand',    'aff.test',    'affiliate'),
  ('aaaaaaaa-1112-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Drop Brand',   'drop.test',   'dropshipping'),
  ('aaaaaaaa-1113-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Both Brand',   'both.test',   'both'),
  ('aaaaaaaa-1114-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Switch Brand', 'switch.test', 'affiliate'),
  ('bbbbbbbb-1112-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'Secret Brand', 'b-drop.test', 'dropshipping');

-- The switch brand: an approved offer with its rules, a tracked link, and a published standard page.
insert into offers (id, client_id, brand_id, name, network) values
  ('aaaaaaaa-2224-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1114-0000-0000-000000000000', 'Switch Offer', 'clickbank');
insert into offer_rules (offer_id, client_id, approved) values
  ('aaaaaaaa-2224-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', true);
update offers set status = 'approved' where id = 'aaaaaaaa-2224-0000-0000-000000000000';
insert into tracked_links (id, client_id, brand_id, offer_id, slug, destination, channel) values
  ('aaaaaaaa-3334-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1114-0000-0000-000000000000',
   'aaaaaaaa-2224-0000-0000-000000000000', 'go1', 'https://seller.test/', 'site');
insert into site_pages (id, client_id, brand_id, kind, slug, title, draft_body, template_key) values
  ('aaaaaaaa-5554-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1114-0000-0000-000000000000',
   'standard', 'contact', 'Contact', 'Write to us.', 'contact');
update site_pages set status = 'published', published_title = title, published_body = draft_body
  where id = 'aaaaaaaa-5554-0000-0000-000000000000';

-- Helper: act as a signed-in user for the rest of the transaction.
create or replace function test_login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  -- A live session that has done the second step (aal2), as after 0009 (T-05).
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'aal', 'aal2', 'session_id', auth.test_session(uid))::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Helper: the statement must be refused by the module rule, with its plain-language message.
create or replace function expect_module_refused(label text, stmt text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when raise_exception then
    if sqlerrm not like 'Refused:%does not include affiliate marketing%' then raise; end if;
    return;
  end;
  raise exception 'T-07: % was accepted for a brand without the affiliate module', label;
end;
$$;
grant execute on function expect_module_refused(text, text) to authenticated;

-- ---------- brand_has_module answers correctly ----------
do $$
begin
  if not brand_has_module('aaaaaaaa-1111-0000-0000-000000000000', 'affiliate')    then raise exception 'T-07: affiliate brand lacks affiliate'; end if;
  if     brand_has_module('aaaaaaaa-1111-0000-0000-000000000000', 'dropshipping') then raise exception 'T-07: affiliate brand has dropshipping'; end if;
  if     brand_has_module('aaaaaaaa-1112-0000-0000-000000000000', 'affiliate')    then raise exception 'T-07: dropshipping brand has affiliate'; end if;
  if not brand_has_module('aaaaaaaa-1112-0000-0000-000000000000', 'dropshipping') then raise exception 'T-07: dropshipping brand lacks dropshipping'; end if;
  if not brand_has_module('aaaaaaaa-1113-0000-0000-000000000000', 'affiliate')    then raise exception 'T-07: both brand lacks affiliate'; end if;
  if not brand_has_module('aaaaaaaa-1113-0000-0000-000000000000', 'dropshipping') then raise exception 'T-07: both brand lacks dropshipping'; end if;
  if     brand_has_module('aaaaaaaa-1113-0000-0000-000000000000', 'unknown')      then raise exception 'T-07: unknown module reported as enabled'; end if;
  if     brand_has_module('99999999-0000-0000-0000-000000000000', 'affiliate')    then raise exception 'T-07: unknown brand reported as enabled'; end if;
end $$;

-- ---------- Before the switch, the switch brand's public site works ----------
do $$
begin
  if (select count(*) from public_brand('switch.test')) <> 1 then raise exception 'setup: switch brand site not found'; end if;
  if (select count(*) from public_pages('switch.test')) <> 1 then raise exception 'setup: switch brand pages not found'; end if;
  if record_click('switch.test', 'go1') is null then raise exception 'setup: switch brand link not working'; end if;
end $$;

-- ---------- The owner switches the brand to dropshipping; the change is logged ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a0');
update brands set business_type = 'dropshipping' where id = 'aaaaaaaa-1114-0000-0000-000000000000';
commit;
reset role;

do $$
begin
  if not exists (
    select 1 from audit_log
    where entity = 'brands' and entity_id = 'aaaaaaaa-1114-0000-0000-000000000000'
      and before ->> 'business_type' = 'affiliate' and after ->> 'business_type' = 'dropshipping'
      and actor_id = '00000000-0000-0000-0000-0000000000a0' and actor_type = 'user'
  ) then
    raise exception 'T-07: business type change was not logged with its actor';
  end if;
end $$;

-- ---------- The database refuses affiliate writes for brands without the module ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a0');
select expect_module_refused('a new offer on a dropshipping brand',
  $$insert into offers (client_id, brand_id, name, network)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1112-0000-0000-000000000000', 'X', 'clickbank')$$);
select expect_module_refused('a new offer on the switched brand',
  $$insert into offers (client_id, brand_id, name, network)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1114-0000-0000-000000000000', 'X', 'clickbank')$$);
select expect_module_refused('an edit to an existing offer of the switched brand',
  $$update offers set name = 'Renamed' where id = 'aaaaaaaa-2224-0000-0000-000000000000'$$);
select expect_module_refused('new offer figures on the switched brand',
  $$insert into offer_metrics (offer_id, client_id, payout)
    values ('aaaaaaaa-2224-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 10)$$);
select expect_module_refused('an edit to the rules record on the switched brand',
  $$update offer_rules set approved = false where offer_id = 'aaaaaaaa-2224-0000-0000-000000000000'$$);
select expect_module_refused('a new tracked link on the switched brand',
  $$insert into tracked_links (client_id, brand_id, offer_id, slug, destination, channel)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1114-0000-0000-000000000000',
            'aaaaaaaa-2224-0000-0000-000000000000', 'go2', 'https://seller.test/', 'pinterest')$$);
select expect_module_refused('a new page on a dropshipping brand',
  $$insert into site_pages (client_id, brand_id, kind, slug, title)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1112-0000-0000-000000000000', 'article', 'x', 'X')$$);
select expect_module_refused('publishing changes to a page of the switched brand',
  $$update site_pages set draft_body = 'Changed' where id = 'aaaaaaaa-5554-0000-0000-000000000000'$$);
rollback;

-- An operator is refused in the same way.
begin;
select test_login('00000000-0000-0000-0000-0000000000a3');
select expect_module_refused('a new offer on a dropshipping brand, by an operator',
  $$insert into offers (client_id, brand_id, name, network)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1112-0000-0000-000000000000', 'X', 'clickbank')$$);
rollback;

-- ---------- Brands with the module are allowed ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a0');
insert into offers (client_id, brand_id, name, network)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'On affiliate', 'clickbank');
insert into offers (client_id, brand_id, name, network)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1113-0000-0000-000000000000', 'On both', 'clickbank');
rollback;

-- ---------- Deletes stay allowed, and sales are still recorded ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a0');
insert into network_sales (client_id, brand_id, offer_id, link_id, network, order_ref, transaction_type, sale_date, commission)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1114-0000-0000-000000000000', 'aaaaaaaa-2224-0000-0000-000000000000',
          'aaaaaaaa-3334-0000-0000-000000000000', 'clickbank', 'R-9', 'sale', now(), 5);
delete from site_pages where id = 'aaaaaaaa-5554-0000-0000-000000000000';
delete from offers where id = 'aaaaaaaa-2224-0000-0000-000000000000';
do $$
begin
  if exists (select 1 from offers where id = 'aaaaaaaa-2224-0000-0000-000000000000') then
    raise exception 'T-07: an offer of a switched brand could not be deleted';
  end if;
end $$;
rollback;

-- ---------- The public site serves nothing for a brand without the module ----------
do $$
declare
  clicks_before bigint := (select count(*) from click_events);
begin
  if (select count(*) from public_brand('switch.test')) <> 0 then raise exception 'T-07: public_brand serves a switched brand'; end if;
  if (select count(*) from public_pages('switch.test')) <> 0 then raise exception 'T-07: public_pages serves a switched brand'; end if;
  if (select count(*) from public_page('switch.test', 'contact')) <> 0 then raise exception 'T-07: public_page serves a switched brand'; end if;
  if record_click('switch.test', 'go1') is not null then raise exception 'T-07: record_click redirects for a switched brand'; end if;
  if (select count(*) from click_events) <> clicks_before then raise exception 'T-07: a click was recorded for a switched brand'; end if;
  if (select count(*) from public_brand('drop.test')) <> 0 then raise exception 'T-07: public_brand serves a dropshipping brand'; end if;
  if (select count(*) from public_brand('both.test')) <> 1 then raise exception 'T-07: public_brand hides a brand of type both'; end if;
end $$;

-- ---------- Only the owner and operators may change a business type ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a1');
update brands set business_type = 'affiliate' where id = 'aaaaaaaa-1112-0000-0000-000000000000';
do $$
begin
  if found then raise exception 'T-07: a client admin changed a business type'; end if;
end $$;
rollback;

begin;
select test_login('00000000-0000-0000-0000-0000000000a3');
update brands set business_type = 'both' where id = 'aaaaaaaa-1112-0000-0000-000000000000';
do $$
begin
  if (select business_type from brands where id = 'aaaaaaaa-1112-0000-0000-000000000000') <> 'both' then
    raise exception 'T-07: an operator could not change a business type';
  end if;
end $$;
rollback;

-- ---------- A user of another client learns nothing about the brand ----------
-- The operator of A writes to client B's dropshipping brand: the access rules
-- refuse it, and the module rule's message (which names the brand) is not shown.
begin;
select test_login('00000000-0000-0000-0000-0000000000a3');
do $$
begin
  begin
    insert into offers (client_id, brand_id, name, network)
    values ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1112-0000-0000-000000000000', 'X', 'clickbank');
    raise exception 'T-07: operator of A wrote an offer into client B';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm like '%Secret Brand%' then raise exception 'T-07: refusal revealed another client''s brand name'; end if;
      raise;
  end;
end $$;
rollback;

\echo 'ALL MODULE RULE TESTS PASSED'
