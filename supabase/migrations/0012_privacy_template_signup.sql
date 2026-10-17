-- =============================================================================
-- 0012: Privacy Policy template: email sign-up (S-08, batch 2)
--
-- Compliance text, reviewed by the owner before building on it.
--
-- 1. The Privacy Policy template's email line becomes two lines: email written
--    to us, and email given through the sign-up form. The template becomes
--    version 2. Nothing else in it changes.
-- 2. Templates and standard pages carry versions. A brand's page is a copy:
--    this file changes no brand's page. A page reaches version 2 only when a
--    person presses "Update from template" (update_page_from_template, which
--    writes the filled template into the page's draft) and then publishes it.
--    The version cannot be set any other way.
-- 3. Email sign-up can be turned on only while the published Privacy Policy is
--    on the current template version and the brand has a contact email, and
--    the launch checklist says so.
-- 4. A standard page cannot be published with a placeholder such as {{email}}
--    left unfilled, and "Update from template" refuses while the brand's
--    business details are missing (so no placeholder is filled with nothing).
-- 5. Visitors sign up through subscribe(), and see the form's wording through
--    public_signup(), only while the Privacy Policy is current; subscribe()
--    names the consent version the form showed, and a changed wording refuses.
--
-- One transaction. Safe to run more than once.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Versions.
-- ----------------------------------------------------------------------------
alter table compliance_templates add column if not exists version integer not null default 1;
alter table site_pages add column if not exists template_version integer;
alter table site_pages add column if not exists published_template_version integer;

-- Every existing standard page was made from version 1 of its template.
update site_pages set template_version = 1 where template_key is not null and template_version is null;
update site_pages set published_template_version = 1
 where template_key is not null and status = 'published' and published_template_version is null;

-- ----------------------------------------------------------------------------
-- 2. The Privacy Policy template, version 2.
-- ----------------------------------------------------------------------------
update compliance_templates
set body = replace(
      body,
      '- **Your email address, if you give it to us.** Only when you write to us or sign up for updates.',
      -- The line break matches the template's own (it depends on how 0003 was saved).
      '- **Your email address, if you write to us.** We use it only to reply.'
        || case when position(chr(13) in body) > 0 then chr(13) || chr(10) else chr(10) end ||
      '- **Your email address, if you sign up for updates.** We keep your email address, the exact wording you agreed to, the page you signed up on, and the time. We use your address only to send the updates you asked for, and we do not sell or share it. Every email will include a way to unsubscribe. You can also unsubscribe, or ask us to delete your address, by writing to {{email}}. When we start sending emails, our email provider will store your address on our behalf.'
    ),
    version = 2,
    updated_at = now()
where key = 'privacy'
  and version = 1
  and position('- **Your email address, if you give it to us.** Only when you write to us or sign up for updates.' in body) > 0;

do $$
declare
  privacy compliance_templates;
begin
  select * into privacy from compliance_templates where key = 'privacy';
  if privacy is null then
    raise exception 'Stopped: the Privacy Policy template (key privacy) was not found. Nothing was changed.';
  end if;
  if privacy.version <> 2
     or position('- **Your email address, if you sign up for updates.**' in privacy.body) = 0 then
    raise exception 'Stopped: the email line of the Privacy Policy template differs from 0003 and 0007, so it was not replaced. Nothing was changed.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Page versions: set by the database only.
-- ----------------------------------------------------------------------------
create or replace function site_pages_template_version() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    -- A new standard page is made from the template as it is now.
    new.template_version := (select t.version from compliance_templates t where t.key = new.template_key);
  elsif new.template_version is distinct from old.template_version
        and coalesce(current_setting('affiqube.template_fill', true), '') <> 'on' then
    raise exception 'page_template_version_locked';
  end if;

  -- The published version is the draft's version at the moment the draft is
  -- published unchanged; otherwise it stays as it was.
  if new.status = 'published' and new.published_body is not distinct from new.draft_body then
    new.published_template_version := new.template_version;
  elsif new.status <> 'published' then
    new.published_template_version := null;
  elsif tg_op = 'UPDATE' then
    new.published_template_version := old.published_template_version;
  else
    new.published_template_version := null;
  end if;
  return new;
end;
$$;
drop trigger if exists site_pages_template_version on site_pages;
create trigger site_pages_template_version before insert or update on site_pages
  for each row execute function site_pages_template_version();

-- "Update from template": the current template, filled with the brand's
-- details, into the page's draft. The published text is unchanged until a
-- person publishes. Owner and operators.
create or replace function update_page_from_template(p_page uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_page site_pages;
  v_brand brands;
  v_template compliance_templates;
  v_body text;
begin
  select * into v_page from site_pages where id = p_page for update;
  if not found or not can_manage(v_page.client_id) then raise exception 'page_update_not_allowed'; end if;
  if v_page.template_key is null then raise exception 'page_not_from_template'; end if;
  select * into v_brand from brands where id = v_page.brand_id;
  if coalesce(btrim(v_brand.profile ->> 'operator'), '') = '' or coalesce(btrim(v_brand.profile ->> 'address'), '') = ''
     or coalesce(btrim(v_brand.profile ->> 'email'), '') = '' then
    raise exception 'page_details_missing';
  end if;
  select * into v_template from compliance_templates where key = v_page.template_key;

  v_body := v_template.body;
  v_body := replace(v_body, '{{brand}}', v_brand.name);
  v_body := replace(v_body, '{{domain}}', v_brand.domain);
  v_body := replace(v_body, '{{operator}}', coalesce(v_brand.profile ->> 'operator', ''));
  v_body := replace(v_body, '{{address}}', coalesce(v_brand.profile ->> 'address', ''));
  v_body := replace(v_body, '{{email}}', coalesce(v_brand.profile ->> 'email', ''));

  perform set_config('affiqube.template_fill', 'on', true);
  update site_pages
     set draft_body = v_body, template_version = v_template.version, updated_at = now()
   where id = p_page;
  perform set_config('affiqube.template_fill', '', true);

  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, before, after)
  values (v_page.client_id, auth.uid(), 'user', 'page_template_update', 'site_pages', p_page::text,
          jsonb_build_object('template_version', v_page.template_version),
          jsonb_build_object('template', v_page.template_key, 'template_version', v_template.version));
end;
$$;

-- A standard page is the compliance text itself: it is never published with a
-- placeholder such as {{email}} left in it.
create or replace function site_pages_no_placeholders() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'published' and new.kind = 'standard'
     and coalesce(new.published_body, '') ~ '\{\{[^}]*\}\}' then
    raise exception 'page_unresolved_placeholder';
  end if;
  return new;
end;
$$;
drop trigger if exists site_pages_no_placeholders on site_pages;
create trigger site_pages_no_placeholders before insert or update on site_pages
  for each row execute function site_pages_no_placeholders();

-- The brand's published Privacy Policy is on the current template version and
-- still says what sign-up stores (owner's review change 2: the paragraph
-- cannot be edited out of the draft before publishing).
create or replace function privacy_page_current(p_brand uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from site_pages p join compliance_templates t on t.key = p.template_key
    where p.brand_id = p_brand and p.template_key = 'privacy' and p.status = 'published'
      and p.published_template_version = t.version
      and position('**Your email address, if you sign up for updates.**' in p.published_body) > 0
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. The checklist (0010) gains privacy_current; turning sign-up on needs it.
-- ----------------------------------------------------------------------------
create or replace function site_launch_checklist(p_brand uuid)
returns table (key text, passed boolean, detail text)
language sql stable security definer set search_path = public, pg_temp as $$
  with b as (
    select br.* from brands br where br.id = p_brand and has_client_access(br.client_id)
  ),
  missing_details as (
    select string_agg(label, ', ' order by ord) as list
    from b, (values (1, 'operator name', 'operator'), (2, 'address', 'address'), (3, 'contact email', 'email')) v(ord, label, field)
    where coalesce(btrim(b.profile ->> v.field), '') = ''
  ),
  missing_pages as (
    select string_agg(t.title, ', ' order by t.sort_order) as list
    from b, compliance_templates t
    where not exists (
      select 1 from site_pages p
      where p.brand_id = b.id and p.template_key = t.key and p.status = 'published'
    )
  ),
  hosts as (
    select d.* from brand_domains d, b where d.brand_id = b.id and d.purpose = 'site'
  )
  select 'module', brand_has_module(b.id, 'affiliate'), null::text from b
  union all
  select 'details', (select list from missing_details) is null, (select list from missing_details) from b
  union all
  select 'standard_pages', (select list from missing_pages) is null, (select list from missing_pages) from b
  union all
  select 'privacy_current',
         not coalesce((select s.signup_enabled from aff_sites s where s.brand_id = b.id), false)
         or privacy_page_current(b.id),
         null::text
  from b
  union all
  select 'domain',
         exists (select 1 from hosts h where h.status = 'verified' and h.failed_since is null
                 and h.verified_at > now() - interval '30 days')
         and not exists (select 1 from hosts h where h.failed_since is not null),
         (select string_agg(h.host, ', ' order by h.host) from hosts h where h.failed_since is not null)
  from b;
$$;

create or replace function set_signup(p_brand uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_site aff_sites;
begin
  select * into v_site from aff_sites where brand_id = p_brand for update;
  if not found or not can_manage(v_site.client_id) then raise exception 'signup_not_allowed'; end if;
  if p_on and v_site.status <> 'live' then raise exception 'signup_site_not_live'; end if;
  if p_on and not privacy_page_current(p_brand) then raise exception 'signup_privacy_outdated'; end if;
  -- The policy tells subscribers to write to this address to unsubscribe or be deleted.
  if p_on and coalesce(btrim((select b.profile ->> 'email' from brands b where b.id = p_brand)), '') = '' then
    raise exception 'signup_no_contact_email';
  end if;
  if v_site.signup_enabled = coalesce(p_on, false) then return; end if;
  update aff_sites set signup_enabled = coalesce(p_on, false) where brand_id = p_brand;
  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, before, after)
  values (v_site.client_id, auth.uid(), 'user', case when p_on then 'signup_on' else 'signup_off' end,
          'aff_sites', p_brand::text,
          jsonb_build_object('signup_enabled', v_site.signup_enabled), jsonb_build_object('signup_enabled', coalesce(p_on, false)));
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. subscribe(): the visitor's only way in (owner's review changes 3 and 4).
-- ----------------------------------------------------------------------------
-- A live site with sign-up on and a current Privacy Policy, for this host.
create or replace function signup_brand_for_host(p_host text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.brand_id
  from aff_sites s
  where s.brand_id = site_brand_for_host(p_host)
    and s.signup_enabled
    and privacy_page_current(s.brand_id);
$$;

drop function if exists subscribe(text, text, text, boolean, text);
create or replace function subscribe(
  p_host            text,
  p_email           text,
  p_page            text,
  p_consented       boolean,
  p_consent_version integer,
  p_honeypot        text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_brand uuid := signup_brand_for_host(p_host);
  v_client uuid;
  v_name text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_consent record;
begin
  if v_brand is null then raise exception 'signup_unavailable'; end if;

  -- A filled honeypot is a bot: the same answer as success, nothing stored.
  if coalesce(btrim(p_honeypot), '') <> '' then return; end if;

  if p_consented is not true then raise exception 'signup_no_consent'; end if;
  select b.client_id, b.name into v_client, v_name from brands b where b.id = v_brand;
  select * into v_consent from current_consent_text('email_signup', v_name);
  -- The visitor agreed to the wording of the version the form showed; if it
  -- has changed since, nothing is stored and the form is shown again.
  if p_consent_version is distinct from v_consent.version then raise exception 'signup_wording_changed'; end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'signup_bad_email';
  end if;
  if (select count(*) from subscribers s
      where s.brand_id = v_brand and s.consented_at > now() - interval '1 minute') >= 30 then
    raise exception 'signup_rate_limited';
  end if;

  -- A known address keeps its original consent record; the answer is the same.
  insert into subscribers (client_id, brand_id, email, consent_key, consent_version, consent_text,
                           source_host, source_page)
  values (v_client, v_brand, v_email, 'email_signup', v_consent.version, v_consent.body,
          request_host(p_host), nullif(left(btrim(coalesce(p_page, '')), 200), ''))
  on conflict (brand_id, email) do nothing;
end;
$$;

-- The form's wording and its version, for a site where subscribe() would
-- work; nothing otherwise, so the form disappears.
create or replace function public_signup(p_host text)
returns table (consent_version integer, consent_text text)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.version, c.body
  from brands b
  cross join lateral current_consent_text('email_signup', b.name) c
  where b.id = signup_brand_for_host(p_host);
$$;

-- ----------------------------------------------------------------------------
-- 6. Privileges.
-- ----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array['update_page_from_template(uuid)', 'privacy_page_current(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  execute 'revoke all on function site_pages_template_version() from public, anon, authenticated';
  execute 'revoke all on function site_pages_no_placeholders() from public, anon, authenticated';
  execute 'revoke all on function signup_brand_for_host(text) from public, anon, authenticated';
  foreach f in array array['subscribe(text, text, text, boolean, integer, text)', 'public_signup(text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

commit;
