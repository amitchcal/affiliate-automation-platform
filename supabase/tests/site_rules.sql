-- =============================================================================
-- Site module tests. Run after 0001_core.sql and 0003_site.sql on a scratch
-- database. A clean run to the final line means every rule held.
-- =============================================================================
\set ON_ERROR_STOP on

insert into clients (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Client B');
insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', null, 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_viewer'),
  ('00000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000000', 'client_admin');
insert into brands (id, client_id, name, domain, profile) values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A', 'brand-a.test',
   '{"tagline":"Plain overviews","operator":"Operator A","email":"hello@brand-a.test","address":"1 Street","internal_note":"never public"}');
insert into offers (id, client_id, brand_id, name, network, affiliate_link) values
  ('aaaaaaaa-2222-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000',
   'aaaaaaaa-1111-0000-0000-000000000000', 'Offer A', 'clickbank', 'https://seller.test/hop');

create or replace function test_login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end;
$$;

-- Everything below runs in one transaction, switching roles as it goes.
begin;
select test_login('00000000-0000-0000-0000-0000000000a0');

-- ---------- slug rules ----------
do $$
begin
  begin
    insert into site_pages (client_id, brand_id, kind, slug, title)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'article', 'go', 'Reserved');
    raise exception 'reserved slug "go" was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into site_pages (client_id, brand_id, kind, slug, title)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'article', 'Bad Slug', 'Bad');
    raise exception 'an invalid slug was accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------- create the standard pages and an offer page, all as drafts ----------
insert into site_pages (client_id, brand_id, kind, slug, title, draft_body, template_key)
select 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000',
       'standard', key, title, body, key
from compliance_templates;

insert into site_pages (id, client_id, brand_id, kind, slug, title, summary, draft_body, offer_id)
values ('aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000',
        'aaaaaaaa-1111-0000-0000-000000000000', 'offer', 'offer-a', 'Offer A: Overview',
        'What Offer A is.', 'Body of the overview.', 'aaaaaaaa-2222-0000-0000-000000000000');

do $$
begin
  -- S-03: a page with no content cannot be published.
  begin
    update site_pages set status = 'published', published_body = ''
    where id = 'aaaaaaaa-3333-0000-0000-000000000000';
    raise exception 'S-03: an empty page was published';
  exception when raise_exception then
    if sqlerrm not like '%no content%' then raise; end if;
  end;

  -- O-05: an offer page cannot be published while its offer is unapproved.
  begin
    update site_pages set status = 'published', published_title = title, published_summary = summary, published_body = draft_body
    where id = 'aaaaaaaa-3333-0000-0000-000000000000';
    raise exception 'O-05: page published for an unapproved offer';
  exception when raise_exception then
    if sqlerrm not like '%offer is not approved%' then raise; end if;
  end;

  -- Approve the offer (needs approved rules, from the core migration).
  insert into offer_rules (offer_id, client_id, compliance_risk, seller_restrictions, approved)
  values ('aaaaaaaa-2222-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'low', 'low', true);
  update offers set status = 'approved' where id = 'aaaaaaaa-2222-0000-0000-000000000000';

  -- S-04: still blocked, because the standard pages are not published.
  begin
    update site_pages set status = 'published', published_title = title, published_summary = summary, published_body = draft_body
    where id = 'aaaaaaaa-3333-0000-0000-000000000000';
    raise exception 'S-04: offer page published before the standard pages';
  exception when raise_exception then
    if sqlerrm not like '%4 standard page(s)%' then raise; end if;
  end;

  -- Publish the four standard pages, then the offer page succeeds.
  update site_pages set status = 'published', published_title = title, published_summary = summary, published_body = draft_body
  where brand_id = 'aaaaaaaa-1111-0000-0000-000000000000' and kind = 'standard';

  insert into tracked_links (client_id, brand_id, offer_id, slug, destination, channel)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000',
          'aaaaaaaa-2222-0000-0000-000000000000', 'offer-a', 'https://seller.test/hop', 'site');

  update site_pages set status = 'published', published_title = title, published_summary = summary, published_body = draft_body
  where id = 'aaaaaaaa-3333-0000-0000-000000000000';

  if (select published_by from site_pages where id = 'aaaaaaaa-3333-0000-0000-000000000000')
       <> '00000000-0000-0000-0000-0000000000a0' then
    raise exception 'S-03: publisher was not recorded';
  end if;
  if not exists (select 1 from audit_log where entity = 'site_pages' and after ->> 'status' = 'published'
                 and entity_id = 'aaaaaaaa-3333-0000-0000-000000000000') then
    raise exception 'S-03: publishing was not written to the audit log';
  end if;

  -- A later draft edit must not change what visitors see.
  update site_pages set draft_body = 'Unreviewed new draft.' where id = 'aaaaaaaa-3333-0000-0000-000000000000';
end $$;

-- ---------- visitors: published content only ----------
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare
  page record;
  destination text;
begin
  if (select count(*) from site_pages) <> 0 then raise exception 'T-02: a visitor can read the pages table'; end if;
  if (select count(*) from tracked_links) <> 0 then raise exception 'T-02: a visitor can read tracked links'; end if;
  if (select count(*) from brands) <> 0 then raise exception 'T-02: a visitor can read brands'; end if;

  -- Host matching ignores case, "www." and a port.
  if (select name from public_brand('WWW.Brand-A.test:443')) <> 'Brand A' then raise exception 'S-01: brand not found by host'; end if;
  if (select tagline from public_brand('brand-a.test')) <> 'Plain overviews' then raise exception 'S-01: tagline missing'; end if;
  if (select count(*) from public_brand('unknown.test')) <> 0 then raise exception 'S-01: unknown host returned a brand'; end if;

  if (select count(*) from public_pages('brand-a.test')) <> 5 then raise exception 'S-05: expected 5 published pages'; end if;

  select * into page from public_page('brand-a.test', 'offer-a');
  if page.body <> 'Body of the overview.' then raise exception 'S-03: visitors see unpublished draft text'; end if;
  if page.cta_link <> 'offer-a' then raise exception 'S-07: page has no site link'; end if;

  -- S-07: a click is recorded and the destination returned.
  destination := record_click('brand-a.test', 'offer-a', 'offer-a', 'pinterest.com');
  if destination <> 'https://seller.test/hop' then raise exception 'S-07: wrong destination'; end if;
  if record_click('brand-a.test', 'no-such-link') is not null then raise exception 'S-07: unknown link returned a destination'; end if;
  if (select count(*) from click_events) <> 0 then raise exception 'T-02: a visitor can read click records'; end if;
end $$;

-- ---------- members see their own clicks; others do not ----------
select test_login('00000000-0000-0000-0000-0000000000a2');
do $$
declare
  click record;
begin
  select * into click from click_events;
  if click.offer_id <> 'aaaaaaaa-2222-0000-0000-000000000000' or click.page_slug <> 'offer-a'
     or click.referrer_host <> 'pinterest.com' then
    raise exception 'S-07: click was not recorded with offer, page and source';
  end if;
  update site_pages set title = 'Changed by viewer' where slug = 'offer-a';
  if found then raise exception 'T-02: a viewer changed a page'; end if;
end $$;

select test_login('00000000-0000-0000-0000-0000000000b1');
do $$
begin
  if (select count(*) from click_events) <> 0 then raise exception 'T-02: client B can read client A clicks'; end if;
  if (select count(*) from site_pages) <> 0 then raise exception 'T-02: client B can read client A pages'; end if;
end $$;

-- ---------- a retired offer stops redirecting, and unpublishing hides the page ----------
select test_login('00000000-0000-0000-0000-0000000000a0');
update offers set status = 'retired' where id = 'aaaaaaaa-2222-0000-0000-000000000000';
update site_pages set status = 'draft' where slug = 'contact';
set local role anon;
do $$
begin
  if record_click('brand-a.test', 'offer-a') is not null then raise exception 'S-07: a retired offer still redirects'; end if;
  if (select count(*) from public_page('brand-a.test', 'contact')) <> 0 then raise exception 'S-03: an unpublished page is still visible'; end if;
end $$;
rollback;

\echo 'ALL SITE RULE TESTS PASSED'
