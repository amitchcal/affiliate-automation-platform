-- =============================================================================
-- Site launch tests (S-01, batch 2, migration 0010). Run after every migration
-- against a scratch database.
--
--   Client A: brand A1 (affiliate, details complete, brand-a-test.com),
--             brand A2 (affiliate, no details), brand A3 (dropshipping)
--   Client B: brand B1 (affiliate, details complete, brand-b-test.com)
--   Users: owner a0; client A admin a1, viewer a2, operator a3;
--          client B admin b1, operator b3
-- =============================================================================
\set ON_ERROR_STOP on

insert into clients (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Client B');
insert into brands (id, client_id, name, domain, business_type, profile) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A1', 'brand-a-test.com', 'affiliate',
   '{"operator":"Operator A","address":"1 Street","email":"hello@brand-a-test.com","tagline":"Plain overviews"}'),
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A2', 'brand-a2-test.com', 'affiliate', '{}'),
  ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A3', 'brand-a3-test.com', 'dropshipping',
   '{"operator":"Operator A","address":"1 Street","email":"hello@brand-a3-test.com"}'),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Brand B1', 'brand-b-test.com', 'affiliate',
   '{"operator":"Operator B","address":"2 Street","email":"hello@brand-b-test.com"}');
insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', null, 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_viewer'),
  ('00000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'operator'),
  ('00000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000000', 'client_admin'),
  ('00000000-0000-0000-0000-0000000000b3', 'bbbbbbbb-0000-0000-0000-000000000000', 'operator');

-- An approved offer and a tracked link for A1 and for B1.
insert into offers (id, client_id, brand_id, name, network, affiliate_link) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'Offer A', 'clickbank', 'https://seller-a.com/hop'),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000001', 'Offer B', 'clickbank', 'https://seller-b.com/hop');
insert into offer_rules (offer_id, client_id, compliance_risk, seller_restrictions, approved) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'low', 'low', true),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'low', 'low', true);
update offers set status = 'approved';
insert into tracked_links (client_id, brand_id, offer_id, slug, destination, channel) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001', 'offer-a', 'https://seller-a.com/hop', 'site'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-2222-0000-0000-000000000001', 'offer-b', 'https://seller-b.com/hop', 'site');

-- Sign in with a live aal2 session (as after 0009).
create or replace function test_login(uid text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'aal', 'aal2', 'session_id', auth.test_session(uid))::text, true);
  execute 'set local role authenticated';
end;
$$;
-- The same person with only a password (aal1).
create or replace function test_login_aal1(uid text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'aal', 'aal1', 'session_id', auth.test_session(uid))::text, true);
  execute 'set local role authenticated';
end;
$$;
create or replace function test_superuser() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
-- The server, with the service role key.
create or replace function test_service() returns void language plpgsql as $$
begin
  perform test_superuser();
  execute 'set local role service_role';
end;
$$;
create or replace function test_anon() returns void language plpgsql as $$
begin
  perform test_superuser();
  execute 'set local role anon';
end;
$$;
-- Runs a statement that must fail with one of the given messages.
create or replace function expect_refusal(p_sql text, p_codes text[]) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected refusal %, but this was allowed: %', p_codes, p_sql;
exception when others then
  if not (sqlerrm = any (p_codes)) then
    raise exception 'expected refusal % but got: % (for: %)', p_codes, sqlerrm, p_sql;
  end if;
end;
$$;
-- The failing keys go_live reports (the exception's detail), or 'went live'.
create or replace function go_live_result(p_brand uuid) returns text language plpgsql as $$
declare
  v_detail text;
begin
  perform go_live(p_brand);
  return 'went live';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  if sqlerrm <> 'site_not_ready' then return sqlerrm; end if;
  return v_detail;
end;
$$;
-- Publishes the four standard pages of a brand, as the screens would.
create or replace function test_publish_standard_pages(p_brand uuid) returns void language plpgsql as $$
begin
  insert into site_pages (client_id, brand_id, kind, slug, title, template_key, draft_body)
  select b.client_id, b.id, 'standard', t.key, t.title, t.key,
         replace(replace(replace(replace(replace(t.body, '{{brand}}', b.name), '{{domain}}', b.domain),
           '{{operator}}', coalesce(b.profile ->> 'operator', '')), '{{address}}', coalesce(b.profile ->> 'address', '')),
           '{{email}}', coalesce(b.profile ->> 'email', ''))
  from brands b, compliance_templates t where b.id = p_brand
  on conflict (brand_id, slug) do nothing;
  update site_pages set status = 'published', published_title = title, published_body = draft_body, published_at = now()
   where brand_id = p_brand and template_key is not null;
end;
$$;
-- A host, added as the owner would, then proven by the server.
create or replace function test_verified_host(p_brand uuid, p_host text, p_purpose text default 'site') returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  insert into brand_domains (client_id, brand_id, host, purpose)
  select client_id, id, p_host, p_purpose from brands where id = p_brand
  returning id into v_id;
  perform test_service();
  perform record_domain_check(v_id, '00000000-0000-0000-0000-0000000000a0', true, null);
  perform test_superuser();
  return v_id;
end;
$$;
grant execute on function test_login(text), test_login_aal1(text), test_superuser(), test_service(), test_anon(),
  expect_refusal(text, text[]), go_live_result(uuid), test_publish_standard_pages(uuid), test_verified_host(uuid, text, text)
  to authenticated, anon, service_role;

-- ---------- Addition 1: host names ----------
do $$
declare
  h text;
begin
  foreach h in array array['brand-a-test.com', 'go.brand-a-test.com', 'www.brand-a-test.com', 'xn--bcher-kva.com',
                           'a1.b2.co.uk', 'x-y.io', repeat('a', 63) || '.com', repeat('abcdefghi.', 25) || 'com'] loop
    if not host_is_valid(h) then raise exception 'S-01: % should be a valid host', h; end if;
  end loop;
  foreach h in array array['1.2.3.4', '10.0.0.1', '::1', '[::1]', '2001:db8::1', 'localhost', 'app.localhost',
                           'printer.local', 'db.internal', 'x.invalid', 'brand-a.test', 'x.example', '4.3.2.1.in-addr.arpa',
                           'affiqube.com', 'app.affiqube.com', 'x.vercel.app', 'singlelabel', 'Upper.com', '-bad.com',
                           'bad-.com', 'a..b.com', 'http://x.com', 'x.com/path', 'x.com:80', 'x.com.', ' x.com', 'x_y.com',
                           repeat('a', 64) || '.com', repeat('abcdefghi.', 26) || 'com', ''] loop
    if host_is_valid(h) then raise exception 'S-01: % should be refused as a host', h; end if;
  end loop;
  if host_is_valid(null) then raise exception 'S-01: null is not a host'; end if;
end $$;

-- The constraint is the barrier: even the database owner cannot store an IP address or an internal name.
do $$
declare
  h text;
begin
  foreach h in array array['1.2.3.4', 'localhost', 'app.affiqube.com', 'x.vercel.app', 'x.test'] loop
    begin
      insert into brand_domains (client_id, brand_id, host, purpose)
      values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', h, 'site');
      raise exception 'S-01: % was stored as a host', h;
    exception when check_violation then null;
    end;
  end loop;
end $$;

-- ---------- Hosts: who may add, read, and change them ----------
begin;
do $$
declare
  v_row brand_domains;
  v_other brand_domains;
  who text;
begin
  -- An operator of client A adds a host; whatever the request says, it starts unproven with a fresh code.
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  insert into brand_domains (client_id, brand_id, host, purpose, status, verified_at, verification_code)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'Shop.Brand-A-Test.com', 'site',
          'verified', now(), 'chosen-by-the-request')
  returning * into v_row;
  if v_row.status <> 'pending' or v_row.verified_at is not null then raise exception 'S-01: a new host started verified'; end if;
  if v_row.verification_code !~ '^[0-9a-f]{32}$' then raise exception 'S-01: the code is not 32 random hex characters: %', v_row.verification_code; end if;
  if v_row.host <> 'shop.brand-a-test.com' then raise exception 'S-01: the host was not lower-cased'; end if;
  if v_row.created_by <> '00000000-0000-0000-0000-0000000000a3' then raise exception 'S-01: created_by not recorded'; end if;

  -- The same host for client B: a different code (addition 2).
  perform test_login('00000000-0000-0000-0000-0000000000b3');
  insert into brand_domains (client_id, brand_id, host, purpose)
  values ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000001', 'shop.brand-a-test.com', 'site')
  returning * into v_other;
  if v_other.verification_code = v_row.verification_code then raise exception 'S-01: two rows share a verification code'; end if;
  -- Client B cannot see client A's host, nor add one to client A's brand.
  if exists (select 1 from brand_domains where id = v_row.id) then raise exception 'T-02: client B read client A''s host'; end if;
  begin
    insert into brand_domains (client_id, brand_id, host, purpose)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'b-adds.brand-a-test.com', 'site');
    raise exception 'T-02: client B added a host to client A''s brand';
  exception when insufficient_privilege then null;
  end;

  -- The client admin and the viewer of A read the host but cannot add one.
  foreach who in array array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'] loop
    perform test_login(who);
    if not exists (select 1 from brand_domains where id = v_row.id) then raise exception 'S-01: a member cannot read the client''s host'; end if;
    begin
      insert into brand_domains (client_id, brand_id, host, purpose)
      values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'admin-adds.brand-a-test.com', 'site');
      raise exception 'S-01: a client admin or viewer added a host';
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- Only owner and operators may ask for a check.
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  if not can_check_domain(v_row.id) then raise exception 'S-01: the operator may check the host'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  if can_check_domain(v_row.id) then raise exception 'S-01: a client admin may not check hosts'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000b3');
  if can_check_domain(v_row.id) then raise exception 'T-02: another client''s operator may check the host'; end if;
  perform test_login_aal1('00000000-0000-0000-0000-0000000000a3');
  if can_check_domain(v_row.id) then raise exception 'T-05: a password-only session may check the host'; end if;

  -- Nobody can set a host's status directly, the owner included.
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  begin
    update brand_domains set status = 'verified', verified_at = now() where id = v_row.id;
  exception when insufficient_privilege then null;
  end;
  perform test_superuser();
  if (select status from brand_domains where id = v_row.id) <> 'pending' then
    raise exception 'S-01: a person set a host verified without the server''s check';
  end if;

  -- The operator may delete the host; the client admin may not.
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  delete from brand_domains where id = v_row.id;
  perform test_superuser();
  if not exists (select 1 from brand_domains where id = v_row.id) then raise exception 'S-01: a client admin deleted a host'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  delete from brand_domains where id = v_row.id;
  perform test_superuser();
  if exists (select 1 from brand_domains where id = v_row.id) then raise exception 'S-01: the operator could not delete the host'; end if;
  if (select count(*) from audit_log where entity = 'brand_domains' and entity_id = v_row.id::text) <> 2 then
    raise exception 'S-01: adding and deleting a host should each be audited';
  end if;
end $$;
rollback;

-- ---------- The server's check result: the service role only ----------
do $$
begin
  if has_function_privilege('authenticated', 'record_domain_check(uuid, uuid, boolean, text)', 'execute')
     or has_function_privilege('anon', 'record_domain_check(uuid, uuid, boolean, text)', 'execute') then
    raise exception 'S-01: people can record a domain check';
  end if;
  if not has_function_privilege('service_role', 'record_domain_check(uuid, uuid, boolean, text)', 'execute') then
    raise exception 'S-01: the server cannot record a domain check';
  end if;
end $$;

begin;
do $$
declare
  v_a uuid;
  v_b uuid;
  r record;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  insert into brand_domains (client_id, brand_id, host, purpose)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'brand-a-test.com', 'site')
  returning id into v_a;
  -- Client B adds the same host while A's is still pending: allowed (nobody can squat a host unproven).
  perform test_login('00000000-0000-0000-0000-0000000000b3');
  insert into brand_domains (client_id, brand_id, host, purpose)
  values ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000001', 'brand-a-test.com', 'site')
  returning id into v_b;

  -- A signed-in person cannot record a result.
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  begin
    perform record_domain_check(v_a, '00000000-0000-0000-0000-0000000000a0', true, null);
    raise exception 'S-01: a person recorded a domain check';
  exception when insufficient_privilege then null;
  end;

  -- A failed check of a pending host: still pending, no failed_since.
  perform test_service();
  select * into r from record_domain_check(v_a, '00000000-0000-0000-0000-0000000000a3', false, 'txt_missing');
  if r.status <> 'pending' or r.failed_since is not null then raise exception 'S-01: a failed first check changed the status'; end if;
  perform expect_refusal(format('select record_domain_check(%L, null, false, %L)', v_a, 'made_up'), array['domain_bad_reason']);

  -- The server proves A's host.
  select * into r from record_domain_check(v_a, '00000000-0000-0000-0000-0000000000a3', true, null);
  if r.status <> 'verified' or r.verified_at is null then raise exception 'S-01: the check did not verify the host'; end if;

  -- Addition 2: B can no longer verify it, nor add it again.
  perform expect_refusal(format('select record_domain_check(%L, null, true, null)', v_b), array['domain_taken']);
  perform test_login('00000000-0000-0000-0000-0000000000b3');
  perform expect_refusal($q$insert into brand_domains (client_id, brand_id, host, purpose)
    values ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000001', 'brand-a-test.com', 'links')$q$,
    array['domain_taken']);
  -- And not even the database owner can store a second verified row for the host.
  perform test_superuser();
  begin
    update brand_domains set status = 'verified', verified_at = now() where id = v_b;
    raise exception 'S-01: two verified rows for one host';
  exception when unique_violation then null;
  end;

  -- Addition 4: a failed re-check keeps the host verified, records when, and a success clears it.
  perform test_service();
  select * into r from record_domain_check(v_a, '00000000-0000-0000-0000-0000000000a3', false, 'not_pointing');
  if r.status <> 'verified' or r.failed_since is null then raise exception 'S-01: a failed re-check should keep the host and set failed_since'; end if;
  select * into r from record_domain_check(v_a, '00000000-0000-0000-0000-0000000000a3', false, 'txt_wrong');
  perform test_superuser();
  if (select check_reason from brand_domains where id = v_a) <> 'txt_wrong' then raise exception 'S-01: the latest reason is not kept'; end if;
  perform test_service();
  select * into r from record_domain_check(v_a, '00000000-0000-0000-0000-0000000000a3', true, null);
  if r.failed_since is not null then raise exception 'S-01: a successful check should clear failed_since'; end if;

  perform test_superuser();
  if (select count(*) from audit_log where action = 'domain_check' and entity_id = v_a::text
      and actor_id = '00000000-0000-0000-0000-0000000000a3') <> 5 then
    raise exception 'S-01: every recorded check should be audited with the person who asked';
  end if;
end $$;
rollback;

-- ---------- Set up site ----------
begin;
do $$
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal($q$select set_up_site('aaaaaaaa-1111-0000-0000-000000000001')$q$, array['site_not_allowed']);
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal($q$select set_up_site('aaaaaaaa-1111-0000-0000-000000000002')$q$, array['site_details_missing']);
  perform expect_refusal($q$select set_up_site('aaaaaaaa-1111-0000-0000-000000000003')$q$, array['site_module_off']);
  perform test_login('00000000-0000-0000-0000-0000000000b3');
  perform expect_refusal($q$select set_up_site('aaaaaaaa-1111-0000-0000-000000000001')$q$, array['site_not_allowed']);
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform set_up_site('aaaaaaaa-1111-0000-0000-000000000001');
  perform set_up_site('aaaaaaaa-1111-0000-0000-000000000001');  -- a second press changes nothing
  perform test_superuser();
  if (select status from aff_sites where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001') <> 'draft' then
    raise exception 'S-01: set up site should create a draft site';
  end if;
  if (select count(*) from audit_log where action = 'site_set_up') <> 1 then raise exception 'S-01: set up should be audited once'; end if;
  -- Nobody writes aff_sites directly.
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  begin
    update aff_sites set status = 'live' where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001';
  exception when insufficient_privilege then null;
  end;
  perform test_superuser();
  if (select status from aff_sites where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001') <> 'draft' then
    raise exception 'S-01: a person changed a site''s status directly';
  end if;
end $$;
rollback;

-- ---------- The launch checklist and going live ----------
-- A1's site is set up; its four standard pages and a Site host are what is missing.
do $$
begin
  perform test_superuser();
  insert into aff_sites (brand_id, client_id) values
    ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000'),
    ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000');
end $$;

begin;
do $$
declare
  c record;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a2');  -- a viewer sees the checklist
  for c in select * from site_launch_checklist('aaaaaaaa-1111-0000-0000-000000000001') loop
    if c.key in ('module', 'details', 'privacy_current') and not c.passed then raise exception 'S-01: % should pass', c.key; end if;
    if c.key in ('standard_pages', 'domain') and c.passed then raise exception 'S-01: % should fail', c.key; end if;
  end loop;
  if (select detail from site_launch_checklist('aaaaaaaa-1111-0000-0000-000000000001') where key = 'standard_pages')
     <> 'Affiliate Disclosure, Privacy Policy, Terms of Use, Contact' then
    raise exception 'S-01: the missing pages should be named in order, got %',
      (select detail from site_launch_checklist('aaaaaaaa-1111-0000-0000-000000000001') where key = 'standard_pages');
  end if;
  perform test_login('00000000-0000-0000-0000-0000000000b1');
  if exists (select 1 from site_launch_checklist('aaaaaaaa-1111-0000-0000-000000000001')) then
    raise exception 'T-02: another client read the checklist';
  end if;
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'standard_pages,domain' then
    raise exception 'S-01: go_live should name the failing items, got %', go_live_result('aaaaaaaa-1111-0000-0000-000000000001');
  end if;
end $$;
rollback;

-- Everything in place for A1: pages published and a verified Site host.
do $$
begin
  perform test_superuser();
  perform test_publish_standard_pages('aaaaaaaa-1111-0000-0000-000000000001');
  perform test_verified_host('aaaaaaaa-1111-0000-0000-000000000001', 'brand-a-test.com');
end $$;

-- Each item failing on its own refuses with its key.
begin;
do $$
declare
  v_host uuid := (select id from brand_domains where host = 'brand-a-test.com');
begin
  perform test_superuser();
  update brands set profile = profile - 'address' where id = 'aaaaaaaa-1111-0000-0000-000000000001';
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'details' then raise exception 'S-01: details alone should refuse'; end if;
  if (select detail from site_launch_checklist('aaaaaaaa-1111-0000-0000-000000000001') where key = 'details') <> 'address' then
    raise exception 'S-01: the missing detail should be named';
  end if;
  perform test_superuser();
  update brands set profile = profile || '{"address":"1 Street"}' where id = 'aaaaaaaa-1111-0000-0000-000000000001';

  update site_pages set status = 'draft' where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001' and template_key = 'terms';
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'standard_pages' then raise exception 'S-01: pages alone should refuse'; end if;
  perform test_superuser();
  update site_pages set status = 'published' where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001' and template_key = 'terms';

  update brand_domains set verified_at = now() - interval '31 days' where id = v_host;
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'domain' then raise exception 'S-01: a stale check alone should refuse'; end if;
  perform test_superuser();
  update brand_domains set verified_at = now() where id = v_host;

  -- Addition 4: a failed re-check blocks going live again.
  perform test_service();
  perform record_domain_check(v_host, null, false, 'not_pointing');
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'domain' then raise exception 'S-01: a failed re-check should refuse'; end if;
  if (select detail from site_launch_checklist('aaaaaaaa-1111-0000-0000-000000000001') where key = 'domain') <> 'brand-a-test.com' then
    raise exception 'S-01: the failing host should be named';
  end if;
  perform test_service();
  perform record_domain_check(v_host, null, true, null);

  perform test_superuser();
  update brands set business_type = 'dropshipping' where id = 'aaaaaaaa-1111-0000-0000-000000000001';
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'module' then raise exception 'S-01: module off alone should refuse'; end if;
end $$;
rollback;

-- Who may go live, and the audit.
begin;
do $$
begin
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'site_not_allowed' then raise exception 'S-01: a client admin went live'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a2');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'site_not_allowed' then raise exception 'S-01: a viewer went live'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000b3');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'site_not_allowed' then raise exception 'T-02: another client''s operator went live'; end if;
  perform test_login_aal1('00000000-0000-0000-0000-0000000000a3');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'site_not_allowed' then raise exception 'T-05: a password-only operator went live'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a2');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000002') <> 'site_not_allowed' then raise exception 'S-01: go_live on a brand without a site'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000002') <> 'site_not_set_up' then raise exception 'S-01: a brand without a site should say so'; end if;
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'went live' then raise exception 'S-01: the operator should go live'; end if;
  if go_live_result('aaaaaaaa-1111-0000-0000-000000000001') <> 'site_already_live' then raise exception 'S-01: going live twice should say so'; end if;
  if (select count(*) from audit_log where action = 'site_go_live') <> 1 then raise exception 'S-01: a refused second go-live was audited'; end if;
  perform test_superuser();
  if (select status from aff_sites where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001') <> 'live' then raise exception 'S-01: not live'; end if;
  if (select went_live_by from aff_sites where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001') <> '00000000-0000-0000-0000-0000000000a3' then
    raise exception 'S-01: went_live_by not recorded';
  end if;
  if not exists (select 1 from audit_log where action = 'site_go_live' and actor_id = '00000000-0000-0000-0000-0000000000a3') then
    raise exception 'S-01: going live is not audited';
  end if;

  -- Taking offline: the client admin may; a viewer and another client may not.
  perform test_login('00000000-0000-0000-0000-0000000000a2');
  perform expect_refusal($q$select take_offline('aaaaaaaa-1111-0000-0000-000000000001')$q$, array['site_offline_not_allowed']);
  perform test_login('00000000-0000-0000-0000-0000000000b1');
  perform expect_refusal($q$select take_offline('aaaaaaaa-1111-0000-0000-000000000001')$q$, array['site_offline_not_allowed']);
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform take_offline('aaaaaaaa-1111-0000-0000-000000000001');
  perform expect_refusal($q$select take_offline('aaaaaaaa-1111-0000-0000-000000000001')$q$, array['site_not_live']);
  perform test_superuser();
  if (select status from aff_sites where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001') <> 'offline' then raise exception 'S-01: not offline'; end if;
  if not exists (select 1 from audit_log where action = 'site_take_offline' and actor_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'S-01: taking offline is not audited';
  end if;
end $$;
rollback;

-- ---------- What visitors see (S01-6, S01-7, addition 3) ----------
-- A1 and B1 both live on their own hosts; A1 also has a Links host.
do $$
begin
  perform test_superuser();
  perform test_publish_standard_pages('bbbbbbbb-1111-0000-0000-000000000001');
  perform test_verified_host('bbbbbbbb-1111-0000-0000-000000000001', 'brand-b-test.com');
  perform test_verified_host('aaaaaaaa-1111-0000-0000-000000000001', 'go.brand-a-test.com', 'links');
  update site_pages set published_title = 'A1 ' || title where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001';
  update site_pages set published_title = 'B1 ' || title where brand_id = 'bbbbbbbb-1111-0000-0000-000000000001';
end $$;

begin;
do $$
declare
  h text;
begin
  -- Draft sites on verified hosts: nothing for visitors.
  perform test_anon();
  if exists (select 1 from public_brand('brand-a-test.com')) or exists (select 1 from public_pages('brand-a-test.com')) then
    raise exception 'S-01: a draft site was served';
  end if;
  if exists (select 1 from public_page('brand-a-test.com', 'privacy')) then raise exception 'S-01: a draft site page was served'; end if;

  perform test_superuser();
  update aff_sites set status = 'live' where brand_id in ('aaaaaaaa-1111-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001');
  perform test_anon();
  if (select name from public_brand('brand-a-test.com')) <> 'Brand A1' then raise exception 'S-01: A1 not served'; end if;
  if (select name from public_brand('BRAND-B-TEST.COM:443')) <> 'Brand B1' then raise exception 'S-01: B1 not served (case, port)'; end if;
  -- Each shows only its own pages and links (S01-7).
  if exists (select 1 from public_pages('brand-a-test.com') where title not like 'A1 %') then raise exception 'S-01: A1 shows another brand''s page'; end if;
  if exists (select 1 from public_pages('brand-b-test.com') where title not like 'B1 %') then raise exception 'S-01: B1 shows another brand''s page'; end if;
  if (select count(*) from public_pages('brand-a-test.com')) <> 4 then raise exception 'S-01: A1 should show its four pages'; end if;
  if record_click('brand-a-test.com', 'offer-b') is not null then raise exception 'S-01: A1''s host redirected B1''s link'; end if;
  if record_click('brand-b-test.com', 'offer-b') not like 'https://seller-b.com/hop?tid=%' then raise exception 'S-01: B1''s link'; end if;

  -- Unknown and look-alike hosts: nothing, and never another brand (addition 3).
  foreach h in array array['unknown-test.com', 'brand-a-test.com.evil.com', 'evil-brand-a-test.com', 'www.brand-a-test.com',
                           'a-test.com', 'test.com', 'com', '', '127.0.0.1', 'localhost'] loop
    if exists (select 1 from public_brand(h)) or exists (select 1 from public_pages(h))
       or exists (select 1 from public_page(h, 'privacy')) or record_click(h, 'offer-a') is not null then
      raise exception 'S-01: the host "%" was served something', h;
    end if;
  end loop;
  if exists (select 1 from public_brand(null)) then raise exception 'S-01: a missing host was served'; end if;

  -- The Links host: redirects only.
  if record_click('go.brand-a-test.com', 'offer-a') not like 'https://seller-a.com/hop?tid=%' then
    raise exception 'S-01: the Links host did not redirect';
  end if;
  if exists (select 1 from public_brand('go.brand-a-test.com')) or exists (select 1 from public_pages('go.brand-a-test.com')) then
    raise exception 'S-01: the Links host served pages';
  end if;
  -- It keeps redirecting while the site is offline (the pages may live elsewhere until S-12).
  perform test_superuser();
  update aff_sites set status = 'offline' where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001';
  perform test_anon();
  if exists (select 1 from public_brand('brand-a-test.com')) then raise exception 'S-01: an offline site was served'; end if;
  if record_click('go.brand-a-test.com', 'offer-a') is null then raise exception 'S-01: the Links host stopped with the site offline'; end if;
  if record_click('brand-a-test.com', 'offer-a') is not null then raise exception 'S-01: an offline site host redirected'; end if;

  -- A host that is pending, or a brand whose module is off: nothing.
  perform test_superuser();
  update brand_domains set status = 'pending', verified_at = null, failed_since = null where host = 'brand-b-test.com';
  perform test_anon();
  if exists (select 1 from public_brand('brand-b-test.com')) then raise exception 'S-01: an unverified host was served'; end if;
  perform test_superuser();
  update brand_domains set status = 'verified', verified_at = now() where host = 'brand-b-test.com';
  update brands set business_type = 'dropshipping' where id = 'bbbbbbbb-1111-0000-0000-000000000001';
  perform test_anon();
  if exists (select 1 from public_brand('brand-b-test.com')) then raise exception 'T-07: a site without the affiliate module was served'; end if;

  -- A failed re-check alone does not take a site down (addition 4).
  perform test_superuser();
  update brands set business_type = 'affiliate' where id = 'bbbbbbbb-1111-0000-0000-000000000001';
  update brand_domains set failed_since = now(), check_ok = false, check_reason = 'not_pointing' where host = 'brand-b-test.com';
  perform test_anon();
  if not exists (select 1 from public_brand('brand-b-test.com')) then raise exception 'S-01: a failed re-check took the site down'; end if;

  -- Visitors read no table.
  if exists (select 1 from brand_domains) or exists (select 1 from aff_sites) then raise exception 'T-02: a visitor read sites or hosts'; end if;
end $$;
rollback;

-- ---------- Preview (S01-8): members of the client only ----------
begin;
do $$
begin
  perform test_login('00000000-0000-0000-0000-0000000000a2');
  if (select name from preview_brand('brand-a-test.com')) <> 'Brand A1' then raise exception 'S-01: a viewer cannot preview the draft site'; end if;
  if (select count(*) from preview_pages('brand-a-test.com')) <> 4 then raise exception 'S-01: preview pages'; end if;
  if (select count(*) from preview_page('brand-a-test.com', 'privacy')) <> 1 then raise exception 'S-01: preview page'; end if;
  if preview_link('brand-a-test.com', 'offer-a') <> 'https://seller-a.com/hop' then raise exception 'S-01: preview link'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000b1');
  if exists (select 1 from preview_brand('brand-a-test.com')) or exists (select 1 from preview_pages('brand-a-test.com'))
     or exists (select 1 from preview_page('brand-a-test.com', 'privacy')) or preview_link('brand-a-test.com', 'offer-a') is not null then
    raise exception 'T-02: another client previewed the site';
  end if;
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  if not exists (select 1 from preview_brand('brand-b-test.com')) then raise exception 'S-01: the owner cannot preview'; end if;
  -- A preview click records nothing.
  perform test_superuser();
  if exists (select 1 from click_events where page_slug = 'preview') then raise exception 'setup'; end if;
end $$;
rollback;

-- ---------- Owner's review change 1: a live site keeps its standard pages published ----------
begin;
do $$
declare
  v_terms uuid := (select id from site_pages where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001' and template_key = 'terms');
begin
  perform test_superuser();
  update aff_sites set status = 'live' where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001';
  insert into site_pages (client_id, brand_id, kind, slug, title, draft_body, status, published_body, published_title)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'article', 'an-article', 'An article',
          'Body', 'published', 'Body', 'An article');

  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal(format($q$update site_pages set status = 'draft' where id = %L$q$, v_terms), array['page_site_live']);
  perform expect_refusal(format($q$delete from site_pages where id = %L$q$, v_terms), array['page_site_live']);
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  perform expect_refusal(format($q$update site_pages set status = 'draft' where id = %L$q$, v_terms), array['page_site_live']);
  perform test_superuser();
  perform expect_refusal(format($q$update site_pages set status = 'draft' where id = %L$q$, v_terms), array['page_site_live']);
  -- Editing the draft, re-publishing, and unpublishing an article stay allowed.
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  update site_pages set draft_body = draft_body || ' Edited.' where id = v_terms;
  update site_pages set status = 'draft' where slug = 'an-article';
  perform test_superuser();
  if (select status from site_pages where id = v_terms) <> 'published' then raise exception 'S-01: the terms page left published'; end if;
  if (select status from site_pages where slug = 'an-article') <> 'draft' then raise exception 'S-01: an article could not be unpublished'; end if;

  -- Offline: allowed again.
  update aff_sites set status = 'offline' where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001';
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  update site_pages set status = 'draft' where id = v_terms;
  perform test_superuser();
  if (select status from site_pages where id = v_terms) <> 'draft' then raise exception 'S-01: offline, the page should unpublish'; end if;
end $$;
rollback;

-- ---------- Owner's review change 5: the same client's second brand cannot verify a verified host ----------
begin;
do $$
declare
  v_second uuid;
begin
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  insert into brand_domains (client_id, brand_id, host, purpose)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000002', 'brand-a-test.com', 'site')
  returning id into v_second;
  perform test_service();
  perform expect_refusal(format('select record_domain_check(%L, null, true, null)', v_second), array['domain_taken']);
  perform test_superuser();
  if (select status from brand_domains where id = v_second) <> 'pending' then raise exception 'S-01: the second brand''s row changed'; end if;
end $$;
rollback;

do $$
declare
  f text;
begin
  foreach f in array array['preview_brand(text)', 'preview_pages(text)', 'preview_page(text, text)', 'preview_link(text, text)',
                           'go_live(uuid)', 'take_offline(uuid)', 'set_up_site(uuid)', 'site_launch_checklist(uuid)',
                           'can_check_domain(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'S-01: visitors can call %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'S-01: the screens cannot call %', f; end if;
  end loop;
  foreach f in array array['site_brand_for_host(text)', 'links_brand_for_host(text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'S-01: % should be callable only inside the public functions', f;
    end if;
  end loop;
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('host_is_valid', 'request_host', 'brand_domains_before_insert', 'can_check_domain', 'record_domain_check',
                      'site_launch_checklist', 'set_up_site', 'go_live', 'take_offline', 'site_brand_for_host',
                      'links_brand_for_host', 'public_brand', 'public_pages', 'public_page', 'record_click',
                      'preview_brand', 'preview_pages', 'preview_page', 'preview_link')
      and not coalesce(proconfig @> array['search_path=public, pg_temp'], false)
  ) then
    raise exception 'S-01: a function of 0010 does not set search_path = public, pg_temp';
  end if;
end $$;

\echo 'ALL SITE LAUNCH RULE TESTS PASSED'
