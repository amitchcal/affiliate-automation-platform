-- =============================================================================
-- Affiqube: every row's client matches the client of its brand, offer and link
-- Increment 5. Run after 0005_modules_and_test_brands.sql.
--
-- The access rules check the client_id written on a row. Before this
-- migration nothing stopped a row from naming one client while pointing at
-- another client's brand or offer: an operator of client A could, for
-- example, add an approved rules record to client B's offer. These composite
-- foreign keys make the database refuse any such row, whatever a policy says.
--
-- Method: each parent gets a unique key that includes client_id, and each
-- child references the parent by (parent id, client_id), plus brand_id and
-- offer_id where the child holds those too. A foreign key that includes a
-- null column is not checked, so optional parents (an article with no offer,
-- an unmatched sale) are unaffected.
--
-- Deletes behave as before. Rows that were deleted with their parent still
-- are. network_sales keeps its sale when a brand, offer or link is deleted:
-- only that one column is cleared, never client_id. ON DELETE SET NULL with
-- a column list needs PostgreSQL 15 or later; the first step checks this.
--
-- Also removes the visitor role's right to call brand_has_module(), which
-- Supabase grants to new functions automatically.
--
-- Existing rows: the owner's live data was checked on 13 October 2026 and
-- had no mismatched rows. If any existed, adding a constraint would fail and
-- the whole file would roll back.
-- Safe to run more than once: each constraint is added only if missing.
-- Verify with supabase/verify_consistency.sql after applying.
-- T-01, T-02
-- =============================================================================

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'This migration needs PostgreSQL 15 or later; this database runs %.', current_setting('server_version');
  end if;
end $$;

-- Adds a constraint unless one with that name already exists on the table.
-- pg_temp: the helper disappears when the session ends.
create or replace function pg_temp.add_constraint_once(p_table text, p_name text, p_definition text)
returns void language plpgsql as $$
begin
  if not exists (
    select 1 from pg_constraint where conname = p_name and conrelid = p_table::regclass
  ) then
    execute format('alter table %s add constraint %I %s', p_table, p_name, p_definition);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Parent keys that include the client
-- ----------------------------------------------------------------------------
select pg_temp.add_constraint_once('brands', 'brands_id_client_key',
  'unique (id, client_id)');
select pg_temp.add_constraint_once('offers', 'offers_id_client_key',
  'unique (id, client_id)');
select pg_temp.add_constraint_once('offers', 'offers_id_brand_client_key',
  'unique (id, brand_id, client_id)');
select pg_temp.add_constraint_once('tracked_links', 'tracked_links_id_client_key',
  'unique (id, client_id)');
select pg_temp.add_constraint_once('tracked_links', 'tracked_links_id_client_brand_offer_key',
  'unique (id, client_id, brand_id, offer_id)');

-- ----------------------------------------------------------------------------
-- Children. Each name ends in _match so the verify query can count them.
-- ----------------------------------------------------------------------------

-- An offer belongs to its brand's client.
select pg_temp.add_constraint_once('offers', 'offers_brand_client_match',
  'foreign key (brand_id, client_id) references brands (id, client_id) on delete cascade');

-- Offer figures and the rules record belong to their offer's client.
select pg_temp.add_constraint_once('offer_metrics', 'offer_metrics_offer_client_match',
  'foreign key (offer_id, client_id) references offers (id, client_id) on delete cascade');
select pg_temp.add_constraint_once('offer_rules', 'offer_rules_offer_client_match',
  'foreign key (offer_id, client_id) references offers (id, client_id) on delete cascade');

-- A tracked link has the same brand and client as its offer.
select pg_temp.add_constraint_once('tracked_links', 'tracked_links_offer_brand_client_match',
  'foreign key (offer_id, brand_id, client_id) references offers (id, brand_id, client_id) on delete cascade');

-- A page belongs to its brand's client; an offer page has its offer's brand and client.
select pg_temp.add_constraint_once('site_pages', 'site_pages_brand_client_match',
  'foreign key (brand_id, client_id) references brands (id, client_id) on delete cascade');
select pg_temp.add_constraint_once('site_pages', 'site_pages_offer_brand_client_match',
  'foreign key (offer_id, brand_id, client_id) references offers (id, brand_id, client_id) on delete cascade');

-- A click has its link's client, brand and offer.
select pg_temp.add_constraint_once('click_events', 'click_events_link_match',
  'foreign key (link_id, client_id, brand_id, offer_id) references tracked_links (id, client_id, brand_id, offer_id) on delete cascade');

-- A sale's brand, offer and link belong to the sale's client. Deleting one of
-- them clears only that column, so the sale and its client are kept.
select pg_temp.add_constraint_once('network_sales', 'network_sales_brand_client_match',
  'foreign key (brand_id, client_id) references brands (id, client_id) on delete set null (brand_id)');
select pg_temp.add_constraint_once('network_sales', 'network_sales_offer_client_match',
  'foreign key (offer_id, client_id) references offers (id, client_id) on delete set null (offer_id)');
select pg_temp.add_constraint_once('network_sales', 'network_sales_link_client_match',
  'foreign key (link_id, client_id) references tracked_links (id, client_id) on delete set null (link_id)');

-- Connections and approval settings belong to their brand's client.
select pg_temp.add_constraint_once('connections', 'connections_brand_client_match',
  'foreign key (brand_id, client_id) references brands (id, client_id) on delete cascade');
select pg_temp.add_constraint_once('approval_settings', 'approval_settings_brand_client_match',
  'foreign key (brand_id, client_id) references brands (id, client_id) on delete cascade');

-- A brand's scoring configuration names that brand's client. A foreign key
-- skips rows with a null column, so a brand-level row must also carry its client.
select pg_temp.add_constraint_once('scoring_configs', 'scoring_configs_brand_client_match',
  'foreign key (brand_id, client_id) references brands (id, client_id) on delete cascade');
select pg_temp.add_constraint_once('scoring_configs', 'scoring_configs_brand_needs_client_match',
  'check (brand_id is null or client_id is not null)');

-- ----------------------------------------------------------------------------
-- Visitors never need brand_has_module(); the public functions call it as
-- their owner. Supabase grants new functions to anon automatically.
-- ----------------------------------------------------------------------------
revoke execute on function brand_has_module(uuid, text) from anon;
