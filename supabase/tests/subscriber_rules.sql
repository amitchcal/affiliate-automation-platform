-- =============================================================================
-- Email sign-up tests (S-08, batch 2, migrations 0011 and 0012). Run after every
-- migration against a scratch database.
--
--   Client A: brand A1 (live on brand-a-test.com), brand A2 (draft, verified host)
--   Client B: brand B1 (live on brand-b-test.com)
--   Users: owner a0; client A admin a1, viewer a2, operator a3; client B admin b1
-- =============================================================================
\set ON_ERROR_STOP on

insert into clients (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Client B');
insert into brands (id, client_id, name, domain, business_type, profile) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A1', 'brand-a-test.com', 'affiliate',
   '{"operator":"Operator A","address":"1 Street","email":"hello@brand-a-test.com"}'),
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A2', 'brand-a2-test.com', 'affiliate',
   '{"operator":"Operator A","address":"1 Street","email":"hello@brand-a2-test.com"}'),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Brand B1', 'brand-b-test.com', 'affiliate',
   '{"operator":"Operator B","address":"2 Street","email":"hello@brand-b-test.com"}');
insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', null, 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_viewer'),
  ('00000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'operator'),
  ('00000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000000', 'client_admin');

-- Each brand's Privacy Policy published from the current template (0012), as
-- sign-up needs; then live sites (test stand-in, local_sites.sql). A2 stays
-- draft on a verified host.
insert into site_pages (client_id, brand_id, kind, slug, title, template_key, draft_body)
select b.client_id, b.id, 'standard', t.key, t.title, t.key,
       replace(replace(replace(replace(replace(t.body, '{{brand}}', b.name), '{{domain}}', b.domain),
           '{{operator}}', coalesce(b.profile ->> 'operator', '')), '{{address}}', coalesce(b.profile ->> 'address', '')),
           '{{email}}', coalesce(b.profile ->> 'email', ''))
from brands b, compliance_templates t where t.key = 'privacy';
update site_pages set status = 'published', published_title = title, published_body = draft_body, published_at = now();
select test_make_live('aaaaaaaa-1111-0000-0000-000000000001');
select test_make_live('bbbbbbbb-1111-0000-0000-000000000001');
select test_make_live('aaaaaaaa-1111-0000-0000-000000000002');
update aff_sites set status = 'draft' where brand_id = 'aaaaaaaa-1111-0000-0000-000000000002';

create or replace function test_login(uid text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'aal', 'aal2', 'session_id', auth.test_session(uid))::text, true);
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
create or replace function test_anon() returns void language plpgsql as $$
begin
  perform test_superuser();
  execute 'set local role anon';
end;
$$;
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
grant execute on function test_login(text), test_superuser(), test_anon(), expect_refusal(text, text[]) to authenticated, anon;

-- The wording visitors are shown for A1, filled in.
create or replace function a1_wording() returns text language sql as $$
  select replace(body, '{{brand}}', 'Brand A1') from consent_texts where key = 'email_signup' and version = 1;
$$;

-- ---------- The switch: off by default; owner and operators; only for a live site ----------
begin;
do $$
begin
  if exists (select 1 from aff_sites where signup_enabled) then raise exception 'S-08: sign-up should start off for every site'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal($q$select set_signup('aaaaaaaa-1111-0000-0000-000000000001', true)$q$, array['signup_not_allowed']);
  perform test_login('00000000-0000-0000-0000-0000000000b1');
  perform expect_refusal($q$select set_signup('aaaaaaaa-1111-0000-0000-000000000001', true)$q$, array['signup_not_allowed']);
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal($q$select set_signup('aaaaaaaa-1111-0000-0000-000000000002', true)$q$, array['signup_site_not_live']);
  -- (Turning it on with a current Privacy Policy is tested in privacy_signup_rules.sql.)
  perform test_anon();
  perform expect_refusal($q$select set_signup('aaaaaaaa-1111-0000-0000-000000000001', true)$q$, array['permission denied for function set_signup']);
end $$;
rollback;

-- From here, sign-up is on for A1 and B1 (as set_signup would leave it) and off for A2.
update aff_sites set signup_enabled = true where brand_id in ('aaaaaaaa-1111-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001');

-- ---------- subscribe(): the visitor's only way in ----------
begin;
do $$
declare
  s subscribers;
begin
  perform test_anon();
  -- Nothing is stored without the tick, a valid address, a live site, and the switch on.
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'pat@example.com', 'home', false, 1)$q$, array['signup_no_consent']);
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'pat@example.com', 'home', null, 1)$q$, array['signup_no_consent']);
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'not-an-address', 'home', true, 1)$q$, array['signup_bad_email']);
  perform expect_refusal($q$select subscribe('brand-a2-test.com', 'pat@example.com', 'home', true, 1)$q$, array['signup_unavailable']);
  perform expect_refusal($q$select subscribe('unknown-test.com', 'pat@example.com', 'home', true, 1)$q$, array['signup_unavailable']);
  perform expect_refusal($q$select subscribe('brand-a-test.com.evil.com', 'pat@example.com', 'home', true, 1)$q$, array['signup_unavailable']);
  perform test_superuser();
  if exists (select 1 from subscribers) then raise exception 'S-08: a refused sign-up stored something'; end if;

  -- Ticked, on a live site with sign-up on.
  perform test_anon();
  perform subscribe('Brand-A-Test.com', '  Pat@Example.com ', 'dog-training-guide', true, 1);
  perform test_superuser();
  select * into s from subscribers;
  if s.email <> 'pat@example.com' then raise exception 'S-08: email not normalised'; end if;
  if s.brand_id <> 'aaaaaaaa-1111-0000-0000-000000000001' or s.client_id <> 'aaaaaaaa-0000-0000-0000-000000000000' then
    raise exception 'S-08: wrong brand or client';
  end if;
  if s.consent_text <> a1_wording() or s.consent_key <> 'email_signup' or s.consent_version <> 1 then
    raise exception 'S-08: the stored consent is not the exact wording shown: %', s.consent_text;
  end if;
  if position('Brand A1' in s.consent_text) = 0 or position('{{' in s.consent_text) > 0 then
    raise exception 'S-08: the wording was not filled with the brand';
  end if;
  if s.consented_at < now() - interval '1 minute' or s.status <> 'pending' or s.confirmed_at is not null then
    raise exception 'S-08: consent time or pending status wrong';
  end if;
  if s.source_host <> 'brand-a-test.com' or s.source_page <> 'dog-training-guide' then raise exception 'S-08: source not recorded'; end if;

  -- The same address again: the same quiet success, one record, the original consent kept.
  perform test_superuser();
  update subscribers set consented_at = now() - interval '1 day';
  perform test_anon();
  perform subscribe('brand-a-test.com', 'PAT@example.com', 'another-page', true, 1);
  perform test_superuser();
  if (select count(*) from subscribers) <> 1 then raise exception 'S-08: a repeat sign-up created a second record'; end if;
  if (select consented_at from subscribers) > now() - interval '23 hours' or (select source_page from subscribers) <> 'dog-training-guide' then
    raise exception 'S-08: a repeat sign-up changed the original consent record';
  end if;

  -- The same address on another brand is that brand's own record.
  perform test_anon();
  perform subscribe('brand-b-test.com', 'pat@example.com', null, true, 1);
  perform test_superuser();
  if (select count(*) from subscribers where brand_id = 'bbbbbbbb-1111-0000-0000-000000000001') <> 1 then
    raise exception 'S-08: sign-ups are per brand';
  end if;

  -- A filled honeypot: the same quiet success, nothing stored.
  perform test_anon();
  perform subscribe('brand-a-test.com', 'bot@example.com', 'home', true, 1, 'http://spam.example');
  perform test_superuser();
  if exists (select 1 from subscribers where email = 'bot@example.com') then raise exception 'S-08: the honeypot stored a sign-up'; end if;

  -- Turned off: refused again, existing records kept.
  update aff_sites set signup_enabled = false where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001';
  perform test_anon();
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'late@example.com', 'home', true, 1)$q$, array['signup_unavailable']);
  perform test_superuser();
  if exists (select 1 from subscribers where email = 'late@example.com') then raise exception 'S-08: stored with sign-up off'; end if;
end $$;
rollback;

-- ---------- The form's wording, and a new version ----------
begin;
do $$
begin
  perform test_anon();
  if (select consent_text from public_signup('brand-a-test.com')) <> a1_wording() then raise exception 'S-08: the form shows other wording'; end if;
  if exists (select 1 from public_signup('brand-a2-test.com')) then raise exception 'S-08: a draft site offers the form'; end if;
  perform subscribe('brand-a-test.com', 'first@example.com', 'home', true, 1);
  perform test_superuser();
  insert into consent_texts (key, version, body) values ('email_signup', 2, 'Version two for {{brand}}.');
  perform test_anon();
  if (select consent_text from public_signup('brand-a-test.com')) <> 'Version two for Brand A1.' then raise exception 'S-08: the newest version is not shown'; end if;
  -- A form still showing version 1 is refused, and nothing is stored (owner's review change 4).
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'second@example.com', 'home', true, 1)$q$, array['signup_wording_changed']);
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'second@example.com', 'home', true, null)$q$, array['signup_wording_changed']);
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'second@example.com', 'home', true, 3)$q$, array['signup_wording_changed']);
  perform test_superuser();
  if exists (select 1 from subscribers where email = 'second@example.com') then raise exception 'S-08: stored with a changed wording'; end if;
  perform test_anon();
  perform subscribe('brand-a-test.com', 'second@example.com', 'home', true, 2);
  perform test_superuser();
  if (select consent_version from subscribers where email = 'first@example.com') <> 1
     or (select consent_text from subscribers where email = 'first@example.com') <> a1_wording() then
    raise exception 'S-08: an earlier record changed with the wording';
  end if;
  if (select consent_version from subscribers where email = 'second@example.com') <> 2
     or (select consent_text from subscribers where email = 'second@example.com') <> 'Version two for Brand A1.' then
    raise exception 'S-08: the new version and its text not stored';
  end if;
  if (select consent_version from public_signup('brand-a-test.com')) <> 2 then raise exception 'S-08: the form should send version 2'; end if;
end $$;
rollback;

-- ---------- No current Privacy Policy, no sign-up (owner's review change 3) ----------
begin;
do $$
begin
  perform test_anon();
  if not exists (select 1 from public_signup('brand-a-test.com')) then raise exception 'setup: the form should show'; end if;

  -- The template moves on: the brand's policy is no longer current.
  perform test_superuser();
  update compliance_templates set version = 3 where key = 'privacy';
  perform test_anon();
  if exists (select 1 from public_signup('brand-a-test.com')) then raise exception 'S-08: the form shows with an outdated policy'; end if;
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'pat@example.com', 'home', true, 1)$q$, array['signup_unavailable']);
  perform test_superuser();
  if exists (select 1 from subscribers) then raise exception 'S-08: stored with an outdated policy'; end if;
end $$;
rollback;

begin;
-- The policy unpublished after sign-up was on. While the site is live this is
-- refused (page_site_live, 0010); the test switches that rule off to reach the case.
alter table site_pages disable trigger site_pages_keep_standard_live;
update site_pages set status = 'draft' where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001' and template_key = 'privacy';
do $$
begin
  perform test_anon();
  if exists (select 1 from public_signup('brand-a-test.com')) then raise exception 'S-08: the form shows without a published policy'; end if;
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'pat@example.com', 'home', true, 1)$q$, array['signup_unavailable']);
  -- Another brand is unaffected.
  perform subscribe('brand-b-test.com', 'pat@example.com', 'home', true, 1);
  perform test_superuser();
  if exists (select 1 from subscribers where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001') then
    raise exception 'S-08: stored without a published policy';
  end if;
end $$;
rollback;

-- ---------- Rate limit: 30 a minute per brand ----------
begin;
do $$
begin
  perform test_superuser();
  insert into subscribers (client_id, brand_id, email, consent_key, consent_version, consent_text, source_host)
  select 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'burst' || g || '@example.com',
         'email_signup', 1, a1_wording(), 'brand-a-test.com'
  from generate_series(1, 30) g;
  perform test_anon();
  perform expect_refusal($q$select subscribe('brand-a-test.com', 'one-more@example.com', 'home', true, 1)$q$, array['signup_rate_limited']);
  perform subscribe('brand-b-test.com', 'one-more@example.com', 'home', true, 1);  -- another brand is not limited
  perform test_superuser();
  update subscribers set consented_at = now() - interval '2 minutes' where email like 'burst%';
  perform test_anon();
  perform subscribe('brand-a-test.com', 'one-more@example.com', 'home', true, 1);
  perform test_superuser();
  if (select count(*) from subscribers where email = 'one-more@example.com') <> 2 then raise exception 'S-08: rate limit did not lift'; end if;
end $$;
rollback;

-- ---------- Who sees subscribers, and deletion (S08-6, S08-7, addition 6) ----------
do $$
begin
  perform test_superuser();
  insert into subscribers (client_id, brand_id, email, consent_key, consent_version, consent_text, source_host, source_page) values
    ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'keep@example.com', 'email_signup', 1, a1_wording(), 'brand-a-test.com', 'home'),
    ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'forget-me@example.com', 'email_signup', 1, a1_wording(), 'brand-a-test.com', 'home'),
    ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000001', 'b-only@example.com', 'email_signup', 1, 'B wording', 'brand-b-test.com', null);
end $$;

begin;
do $$
declare
  who text;
  v_id uuid;
begin
  foreach who in array array['00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1'] loop
    perform test_login(who);
    if (select count(*) from subscribers where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001') <> 2 then
      raise exception 'S-08: % should see A1''s subscribers', who;
    end if;
  end loop;
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  if exists (select 1 from subscribers where client_id = 'bbbbbbbb-0000-0000-0000-000000000000') then raise exception 'T-02: client A read client B''s subscribers'; end if;

  -- The viewer sees the number only.
  perform test_login('00000000-0000-0000-0000-0000000000a2');
  if exists (select 1 from subscribers) then raise exception 'S-08: a viewer read subscriber emails'; end if;
  if subscriber_count('aaaaaaaa-1111-0000-0000-000000000001') <> 2 then raise exception 'S-08: the viewer should see the count'; end if;
  if subscriber_count('bbbbbbbb-1111-0000-0000-000000000001') <> 0 then raise exception 'T-02: client A counted client B''s subscribers'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000b1');
  if exists (select 1 from subscribers where client_id = 'aaaaaaaa-0000-0000-0000-000000000000') then raise exception 'T-02: client B read client A''s subscribers'; end if;

  -- Visitors: no table access in any direction.
  perform test_anon();
  if exists (select 1 from subscribers) then raise exception 'S-08: a visitor read subscribers'; end if;
  begin
    insert into subscribers (client_id, brand_id, email, consent_key, consent_version, consent_text, source_host)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'direct@example.com', 'email_signup', 1, 'anything', 'x.com');
    raise exception 'S-08: a visitor inserted a subscriber directly';
  exception when insufficient_privilege then null;
  end;
  update subscribers set status = 'confirmed', confirmed_at = now();
  delete from subscribers;
  perform test_superuser();
  if (select count(*) from subscribers) <> 3 or exists (select 1 from subscribers where status <> 'pending') then
    raise exception 'S-08: a visitor changed or deleted subscribers';
  end if;

  -- Signed-in people cannot insert or update directly either.
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  begin
    insert into subscribers (client_id, brand_id, email, consent_key, consent_version, consent_text, source_host)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'direct@example.com', 'email_signup', 1, 'anything', 'x.com');
    raise exception 'S-08: the owner inserted a subscriber directly';
  exception when insufficient_privilege then null;
  end;
  update subscribers set consent_text = 'rewritten';
  perform test_superuser();
  if exists (select 1 from subscribers where consent_text = 'rewritten') then raise exception 'S-08: a consent record was rewritten'; end if;

  -- Deletion: the client admin may not; the operator may.
  select id into v_id from subscribers where email = 'forget-me@example.com';
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  delete from subscribers where id = v_id;
  perform test_superuser();
  if not exists (select 1 from subscribers where id = v_id) then raise exception 'S-08: a client admin deleted a subscriber'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  delete from subscribers where id = v_id;
  perform test_superuser();
  if exists (select 1 from subscribers where id = v_id) then raise exception 'S-08: the operator could not delete'; end if;

  -- What remains: one audit entry with the id, brand, client, actor and time, and no email anywhere.
  if not exists (
    select 1 from audit_log
    where action = 'subscriber_deleted' and entity = 'subscribers' and entity_id = v_id::text
      and client_id = 'aaaaaaaa-0000-0000-0000-000000000000' and actor_id = '00000000-0000-0000-0000-0000000000a3'
      and before is null and after = jsonb_build_object('brand_id', 'aaaaaaaa-1111-0000-0000-000000000001')
  ) then
    raise exception 'S-08: the deletion audit entry is missing or carries more than it should';
  end if;
  if exists (select 1 from audit_log a where to_jsonb(a)::text ilike '%forget-me%') then
    raise exception 'S-08: the deleted email address remains in the audit log';
  end if;
  if exists (select 1 from subscribers where email ilike '%forget-me%') then raise exception 'S-08: the email remains'; end if;
end $$;
rollback;

-- ---------- Privileges and search paths ----------
do $$
declare
  f text;
begin
  foreach f in array array['subscribe(text, text, text, boolean, integer, text)', 'public_signup(text)'] loop
    if not has_function_privilege('anon', f, 'execute') then raise exception 'S-08: visitors cannot call %', f; end if;
  end loop;
  foreach f in array array['set_signup(uuid, boolean)', 'subscriber_count(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'S-08: visitors can call %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'S-08: the screens cannot call %', f; end if;
  end loop;
  if to_regprocedure('public.subscribe(text, text, text, boolean, text)') is not null then
    raise exception 'S-08: the old subscribe() without a consent version still exists';
  end if;
  foreach f in array array['current_consent_text(text, text)', 'subscribers_audit_delete()', 'signup_brand_for_host(text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'S-08: % should be internal', f;
    end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_name = 'subscribers'
             and column_name ~ '(ip|agent|address_ip|user_agent|name)$' and column_name <> 'email') then
    raise exception 'S-08: subscribers stores more than the consent record (Q4: no IP addresses)';
  end if;
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('current_consent_text', 'subscribers_audit_delete', 'subscriber_count', 'set_signup', 'subscribe', 'public_signup',
                      'signup_brand_for_host')
      and not coalesce(proconfig @> array['search_path=public, pg_temp'], false)
  ) then
    raise exception 'S-08: a function of 0011 does not set search_path = public, pg_temp';
  end if;
end $$;

\echo 'ALL SUBSCRIBER RULE TESTS PASSED'
