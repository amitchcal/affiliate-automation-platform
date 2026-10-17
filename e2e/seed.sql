-- =============================================================================
-- Test data for the end-to-end tests (increment 5.1). Loaded by
-- scripts/e2e-db.mjs into the LOCAL Supabase only, after migrations 0001-0006.
-- Never run this on the hosted project.
--
-- Already present from the migrations: the owner's membership (0002), the
-- client Vividha Marketing with AffilyVault (affiliate) and Famperia
-- (dropshipping) (0002, 0005), and the ClickBank connection (0004).
--
-- Added here:
--   * memberships for the client admin, the client viewer, and a second
--     client's admin (their accounts are created by e2e-db.mjs first);
--   * Separation Test Co with one brand, to prove clients are kept apart (T-01);
--   * AffilyVault business details, so the standard pages can be created;
--   * one approved AffilyVault offer with figures, an approved rules record,
--     a Pinterest link, and sales rows on fixed dates for the Results screen.
-- =============================================================================
\set ON_ERROR_STOP on

do $$
begin
  if (select count(*) from auth.users where email like 'e2e.%@example.com') <> 3 then
    raise exception 'The three e2e test users must be created before this seed runs.';
  end if;
end $$;

-- Separation Test Co (T-01)
insert into clients (id, name) values ('44444444-4444-4444-8444-444444444444', 'Separation Test Co');
insert into brands (id, client_id, name, domain, business_type, target_country)
values ('45454545-4545-4545-8545-454545454545', '44444444-4444-4444-8444-444444444444',
        'Separate Brand', 'separate-brand.example', 'affiliate', 'US');

-- Memberships (T-02)
insert into memberships (user_id, client_id, role)
select id, '11111111-1111-4111-8111-111111111111', 'client_admin' from auth.users where email = 'e2e.client.admin@example.com';
insert into memberships (user_id, client_id, role)
select id, '11111111-1111-4111-8111-111111111111', 'client_viewer' from auth.users where email = 'e2e.client.viewer@example.com';
insert into memberships (user_id, client_id, role)
select id, '44444444-4444-4444-8444-444444444444', 'client_admin' from auth.users where email = 'e2e.other.admin@example.com';

-- AffilyVault business details (C-01), needed to create the standard pages (C-04)
update brands
set profile = '{"operator": "Vividha Marketing", "address": "Kolkata, India", "email": "hello@affilyvault.example", "tagline": "Independent overviews of pet training courses"}'::jsonb
where id = '22222222-2222-4222-8222-222222222222';

-- One approved offer. The seller's address uses the reserved .example domain,
-- and the browser tests stop any request to it, so no outside site is called.
insert into offers (id, client_id, brand_id, name, network, seller_ref, affiliate_link, source, status, score, channel, provisional)
values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222', 'Pet Sleep Guide', 'clickbank', 'petsleep',
        'https://seller.example/pet-sleep-guide', 'suggested', 'scored', 48, 'organic', false);
insert into offer_metrics (offer_id, client_id, captured_on, payout, conversion_rate, epc, gravity, recurring)
values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
        '2026-09-01', 42.25, 0.40, 0.17, 14.92, false);
insert into offer_rules (offer_id, client_id, compliance_risk, seller_restrictions, approved)
values ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', 'low', 'low', true);
-- Approved through the normal rule: the rules record is approved first (C-03).
update offers set status = 'approved' where id = '55555555-5555-4555-8555-555555555555';

insert into tracked_links (id, client_id, brand_id, offer_id, slug, destination, channel, campaign)
values ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555',
        'pet-sleep-guide-pinterest-autumn', 'https://seller.example/pet-sleep-guide', 'pinterest', 'autumn');

-- Sales (P-01, P-03), on fixed past dates:
--   September 2026: one sale of $25.00                      -> 1 sale,  net $25.00
--   1-10 October 2026: two sales of $30.00, one refund of
--   $30.00, and a $999 test order that must be ignored      -> 2 sales, net $30.00
insert into network_sales (client_id, brand_id, offer_id, link_id, network, order_ref, transaction_type, is_test, sale_date, commission, product_title)
values
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555',
   '66666666-6666-4666-8666-666666666666', 'clickbank', 'E2E0001', 'sale', false, '2026-09-10 12:00+00', 25.00, 'Pet Sleep Guide'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555',
   '66666666-6666-4666-8666-666666666666', 'clickbank', 'E2E0002', 'sale', false, '2026-10-03 12:00+00', 30.00, 'Pet Sleep Guide'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555',
   '66666666-6666-4666-8666-666666666666', 'clickbank', 'E2E0003', 'sale', false, '2026-10-04 12:00+00', 30.00, 'Pet Sleep Guide'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555',
   '66666666-6666-4666-8666-666666666666', 'clickbank', 'E2E0003', 'refund', false, '2026-10-05 12:00+00', -30.00, 'Pet Sleep Guide'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '55555555-5555-4555-8555-555555555555',
   '66666666-6666-4666-8666-666666666666', 'clickbank', 'E2E0004', 'sale', true, '2026-10-06 12:00+00', 999.00, 'Pet Sleep Guide');
