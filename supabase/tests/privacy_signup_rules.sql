-- =============================================================================
-- Privacy Policy and sign-up tests (S-08, batch 2, migration 0012). Run after
-- every migration against a scratch database.
--
-- A template change reaches a brand's page only through "Update from
-- template" and a person publishing it; 0012 itself changes no brand's page;
-- the page version cannot be set any other way; sign-up needs the current
-- Privacy Policy published.
-- =============================================================================
\set ON_ERROR_STOP on

insert into clients (id, name) values ('aaaaaaaa-0000-0000-0000-000000000000', 'Client A');
insert into brands (id, client_id, name, domain, business_type, profile) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A1', 'brand-a-test.com', 'affiliate',
   '{"operator":"Operator A","address":"1 Street","email":"hello@brand-a-test.com"}');
insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', null, 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_admin'),
  ('00000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000000', 'operator');
select test_make_live('aaaaaaaa-1111-0000-0000-000000000001');

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
grant execute on function test_login(text), test_superuser(), expect_refusal(text, text[]) to authenticated;

-- ---------- The template ----------
do $$
begin
  if (select version from compliance_templates where key = 'privacy') <> 2 then raise exception 'S-08: privacy template should be version 2'; end if;
  if exists (select 1 from compliance_templates where key <> 'privacy' and version <> 1) then
    raise exception 'S-08: 0012 changed the version of another template';
  end if;
end $$;

-- ---------- 0012 changes no existing brand's page (addition 5) ----------
-- Put the template back as it was before 0012, publish A1's Privacy Policy from
-- it, then apply 0012 again: the template moves on, the page does not.
do $$
begin
  update compliance_templates
     set body = replace(
           replace(body, E'\r', ''),
           '- **Your email address, if you write to us.** We use it only to reply.' || E'\n' ||
           '- **Your email address, if you sign up for updates.** We keep your email address, the exact wording you agreed to, the page you signed up on, and the time. We use your address only to send the updates you asked for, and we do not sell or share it. Every email will include a way to unsubscribe. You can also unsubscribe, or ask us to delete your address, by writing to {{email}}. When we start sending emails, our email provider will store your address on our behalf.',
           '- **Your email address, if you give it to us.** Only when you write to us or sign up for updates.'),
         version = 1
   where key = 'privacy';
  if position('if you give it to us' in (select body from compliance_templates where key = 'privacy')) = 0 then
    raise exception 'setup: could not restore the version 1 template';
  end if;
  insert into site_pages (client_id, brand_id, kind, slug, title, template_key, draft_body)
  select 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'standard', t.key, t.title, t.key,
         replace(replace(replace(replace(replace(t.body, '{{brand}}', 'Brand A1'), '{{domain}}', 'brand-a-test.com'),
           '{{operator}}', 'Operator A'), '{{address}}', '1 Street'), '{{email}}', 'hello@brand-a-test.com')
  from compliance_templates t;
  update site_pages set status = 'published', published_title = title, published_body = draft_body, published_at = now();
end $$;
create temporary table page_before as select * from site_pages where template_key = 'privacy';

\i supabase/migrations/0012_privacy_template_signup.sql

do $$
declare
  p site_pages;
  b page_before;
begin
  select * into p from site_pages where template_key = 'privacy';
  select * into b from page_before;
  if (select version from compliance_templates where key = 'privacy') <> 2 then raise exception 'S-08: 0012 did not update the template'; end if;
  if p.draft_body <> b.draft_body or p.published_body <> b.published_body or p.updated_at <> b.updated_at then
    raise exception 'S-08: 0012 changed an existing brand''s Privacy Policy page';
  end if;
  if p.template_version <> 1 or p.published_template_version <> 1 then
    raise exception 'S-08: the existing page should stay on version 1 (got %, %)', p.template_version, p.published_template_version;
  end if;
  if privacy_page_current('aaaaaaaa-1111-0000-0000-000000000001') then raise exception 'S-08: a version 1 page counted as current'; end if;
end $$;

-- ---------- The page version is the database's to set ----------
begin;
do $$
declare
  v_page uuid := (select id from site_pages where template_key = 'privacy');
begin
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal(format('update site_pages set template_version = 2 where id = %L', v_page), array['page_template_version_locked']);
  perform test_superuser();
  perform expect_refusal(format('update site_pages set template_version = 2 where id = %L', v_page), array['page_template_version_locked']);
  -- Setting the published version directly has no effect.
  update site_pages set published_template_version = 2 where id = v_page;
  if (select published_template_version from site_pages where id = v_page) <> 1 then
    raise exception 'S-08: the published version was set directly';
  end if;
  -- A new standard page is made from the template as it is now.
  insert into brands (id, client_id, name, domain, business_type)
  values ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A2', 'brand-a2-test.com', 'affiliate');
  insert into site_pages (client_id, brand_id, kind, slug, title, template_key, draft_body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000002', 'standard', 'privacy', 'Privacy Policy', 'privacy', 'x');
  if (select template_version from site_pages where brand_id = 'aaaaaaaa-1111-0000-0000-000000000002') <> 2 then
    raise exception 'S-08: a new page should be version 2';
  end if;
end $$;
rollback;

-- ---------- Update from template, then publish ----------
begin;
do $$
declare
  v_page uuid := (select id from site_pages where template_key = 'privacy');
  v_other uuid;
  p site_pages;
begin
  -- Sign-up cannot be turned on while the published page is on version 1.
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal($q$select set_signup('aaaaaaaa-1111-0000-0000-000000000001', true)$q$, array['signup_privacy_outdated']);

  -- Only owner and operators may update from the template.
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal(format('select update_page_from_template(%L)', v_page), array['page_update_not_allowed']);

  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform update_page_from_template(v_page);
  perform test_superuser();
  select * into p from site_pages where id = v_page;
  if p.template_version <> 2 then raise exception 'S-08: the draft should be version 2'; end if;
  if position('if you sign up for updates' in p.draft_body) = 0 or position('hello@brand-a-test.com' in p.draft_body) = 0
     or position('{{' in p.draft_body) > 0 then
    raise exception 'S-08: the draft is not the filled version 2 template';
  end if;
  if position('if you sign up for updates' in p.published_body) > 0 or p.published_template_version <> 1 then
    raise exception 'S-08: updating from the template changed the published page';
  end if;
  if not exists (select 1 from audit_log where action = 'page_template_update' and entity_id = v_page::text) then
    raise exception 'S-08: the update from template is not audited';
  end if;

  -- Still refused: the new wording is only a draft.
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal($q$select set_signup('aaaaaaaa-1111-0000-0000-000000000001', true)$q$, array['signup_privacy_outdated']);

  -- Publishing something other than the draft does not count as the new version.
  update site_pages set published_body = 'edited elsewhere', status = 'published' where id = v_page;
  perform test_superuser();
  if (select published_template_version from site_pages where id = v_page) <> 1 then
    raise exception 'S-08: publishing other text recorded version 2';
  end if;

  -- The person publishes the draft: now version 2, and sign-up can be turned on.
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  update site_pages set published_body = draft_body, status = 'published' where id = v_page;
  perform test_superuser();
  if (select published_template_version from site_pages where id = v_page) <> 2 then raise exception 'S-08: publish did not record version 2'; end if;
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform set_signup('aaaaaaaa-1111-0000-0000-000000000001', true);
  perform test_superuser();
  if not (select signup_enabled from aff_sites where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001') then raise exception 'S-08: sign-up not on'; end if;
  if not exists (select 1 from audit_log where action = 'signup_on' and actor_id = '00000000-0000-0000-0000-0000000000a3') then
    raise exception 'S-08: turning sign-up on is not audited';
  end if;
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  if not (select passed from site_launch_checklist('aaaaaaaa-1111-0000-0000-000000000001') where key = 'privacy_current') then
    raise exception 'S-08: privacy_current should pass';
  end if;

  -- Editing the draft afterwards keeps the published version.
  perform test_superuser();
  update site_pages set draft_body = draft_body || ' More.' where id = v_page;
  if (select published_template_version from site_pages where id = v_page) <> 2 then raise exception 'S-08: a draft edit changed the published version'; end if;

  -- A newer template: the checklist says so while sign-up is on.
  update compliance_templates set version = 3 where key = 'privacy';
  perform test_login('00000000-0000-0000-0000-0000000000a0');
  if (select passed from site_launch_checklist('aaaaaaaa-1111-0000-0000-000000000001') where key = 'privacy_current') then
    raise exception 'S-08: privacy_current should fail after a newer template';
  end if;

  -- A page not made from a template cannot be updated from one.
  perform test_superuser();
  insert into site_pages (client_id, brand_id, kind, slug, title, draft_body)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'article', 'an-article', 'An article', 'x')
  returning id into v_other;
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal(format('select update_page_from_template(%L)', v_other), array['page_not_from_template']);
end $$;
rollback;

-- ---------- Owner's review change 2: the sign-up paragraph must be in the published policy ----------
begin;
do $$
declare
  v_page uuid := (select id from site_pages where template_key = 'privacy');
begin
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform update_page_from_template(v_page);
  -- The paragraph is edited out of the draft, and the draft published as it is.
  update site_pages
     set draft_body = regexp_replace(draft_body, '- \*\*Your email address, if you sign up for updates\.\*\*[^\n]*\n?', '')
   where id = v_page;
  update site_pages set published_body = draft_body, status = 'published' where id = v_page;
  perform test_superuser();
  if position('if you sign up for updates' in (select published_body from site_pages where id = v_page)) > 0 then
    raise exception 'setup: the paragraph should be gone';
  end if;
  if (select published_template_version from site_pages where id = v_page) <> 2 then raise exception 'setup: version 2 published'; end if;
  if privacy_page_current('aaaaaaaa-1111-0000-0000-000000000001') then
    raise exception 'S-08: a policy without the sign-up paragraph counted as current';
  end if;
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal($q$select set_signup('aaaaaaaa-1111-0000-0000-000000000001', true)$q$, array['signup_privacy_outdated']);
end $$;
rollback;

-- ---------- Owner's item 5: no sign-up without a contact email; no policy with {{email}} unfilled ----------
begin;
do $$
declare
  v_page uuid := (select id from site_pages where template_key = 'privacy');
begin
  -- The Privacy Policy is current, so only the missing email stands in the way.
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform update_page_from_template(v_page);
  update site_pages set published_body = draft_body, status = 'published' where id = v_page;
  perform test_superuser();
  if not privacy_page_current('aaaaaaaa-1111-0000-0000-000000000001') then raise exception 'setup: privacy page should be current'; end if;

  update brands set profile = profile - 'email' where id = 'aaaaaaaa-1111-0000-0000-000000000001';
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal($q$select set_signup('aaaaaaaa-1111-0000-0000-000000000001', true)$q$, array['signup_no_contact_email']);
  perform test_superuser();
  update brands set profile = profile || '{"email":"  "}' where id = 'aaaaaaaa-1111-0000-0000-000000000001';
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal($q$select set_signup('aaaaaaaa-1111-0000-0000-000000000001', true)$q$, array['signup_no_contact_email']);
  -- Nor can the policy be refilled from the template without the email (it would read "writing to .").
  perform expect_refusal(format('select update_page_from_template(%L)', v_page), array['page_details_missing']);
  perform test_superuser();
  if (select signup_enabled from aff_sites where brand_id = 'aaaaaaaa-1111-0000-0000-000000000001') then
    raise exception 'S-08: sign-up was switched on without a contact email';
  end if;

  -- A policy with {{email}} left in it cannot be published, by the operator or by anyone.
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal(format($q$update site_pages set draft_body = 'Write to {{email}}.', published_body = 'Write to {{email}}.', status = 'published' where id = %L$q$, v_page),
                         array['page_unresolved_placeholder']);
  perform test_superuser();
  perform expect_refusal(format($q$update site_pages set published_body = 'Operated by {{ operator }}.' where id = %L$q$, v_page),
                         array['page_unresolved_placeholder']);
  perform expect_refusal($q$insert into site_pages (client_id, brand_id, kind, slug, title, template_key, draft_body, status, published_body)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000001', 'standard', 'contact-2', 'Contact', null,
            'x', 'published', 'Email {{email}}')$q$, array['page_unresolved_placeholder']);
  if position('{{' in (select published_body from site_pages where id = v_page)) > 0 then
    raise exception 'S-08: a policy with a placeholder was published';
  end if;
  -- A draft may hold a placeholder while it is being edited; only publishing is refused.
  update site_pages set draft_body = 'Draft with {{email}}' where id = v_page;
end $$;
rollback;

-- ---------- privacy_page_current is internal (owner's SQL review, change 1) ----------
insert into clients (id, name) values ('bbbbbbbb-0000-0000-0000-000000000000', 'Client B');
insert into brands (id, client_id, name, domain, business_type)
values ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'Brand B1', 'brand-b-test.com', 'affiliate');
begin;
do $$
begin
  -- A signed-in user of client A, asking about client B's brand: a permission error, not an answer.
  perform test_login('00000000-0000-0000-0000-0000000000a1');
  perform expect_refusal($q$select privacy_page_current('bbbbbbbb-1111-0000-0000-000000000001')$q$,
                         array['permission denied for function privacy_page_current']);
  -- Nor about their own (the screens read the checklist's privacy_current row instead).
  perform test_login('00000000-0000-0000-0000-0000000000a3');
  perform expect_refusal($q$select privacy_page_current('aaaaaaaa-1111-0000-0000-000000000001')$q$,
                         array['permission denied for function privacy_page_current']);
  if exists (select 1 from site_launch_checklist('aaaaaaaa-1111-0000-0000-000000000001') where key = 'privacy_current') is not true then
    raise exception 'S-08: the checklist should still answer privacy_current';
  end if;
  perform test_superuser();
  if has_function_privilege('authenticated', 'privacy_page_current(uuid)', 'execute')
     or has_function_privilege('anon', 'privacy_page_current(uuid)', 'execute') then
    raise exception 'S-08: privacy_page_current should be callable only inside other functions';
  end if;
end $$;
rollback;

\echo 'ALL PRIVACY SIGN-UP TESTS PASSED'
