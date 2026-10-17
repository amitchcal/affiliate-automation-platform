-- Privacy Policy template for email sign-up (S-08), migration 0012.
-- Run the whole file after applying 0012. Every row should read "ok"; the last
-- row is information: the brands whose published Privacy Policy is still on
-- an older template version. Their pages are copies and were not changed;
-- use "Update from template" on the Site and links tab, review, and publish.
select 'the Privacy Policy template is version 2' as check,
       case when (select version from compliance_templates where key = 'privacy') = 2 then 'ok' else 'no' end as result
union all
select 'the new sign-up line is in the template once',
       case when (select (length(body) - length(replace(body, '- **Your email address, if you sign up for updates.**', '')))
                         / length('- **Your email address, if you sign up for updates.**')
                  from compliance_templates where key = 'privacy') = 1
            then 'ok' else 'no' end
union all
select 'the old email line is gone',
       case when (select position('Only when you write to us or sign up for updates.' in body)
                  from compliance_templates where key = 'privacy') = 0
            then 'ok' else 'no' end
union all
select 'the other templates are unchanged (version 1)',
       case when not exists (select 1 from compliance_templates where key <> 'privacy' and version <> 1) then 'ok' else 'no' end
union all
select 'page versions are set only by the database',
       case when exists (select 1 from pg_trigger where tgname = 'site_pages_template_version')
             and pg_get_functiondef(to_regprocedure('public.site_pages_template_version()')) like '%page_template_version_locked%'
            then 'ok' else 'missing' end
union all
select 'a current policy must still contain the sign-up paragraph',
       case when pg_get_functiondef(to_regprocedure('public.privacy_page_current(uuid)')) like '%if you sign up for updates.**%'
            then 'ok' else 'no' end
union all
select 'sign-up needs the current Privacy Policy published',
       case when pg_get_functiondef(to_regprocedure('public.set_signup(uuid, boolean)')) like '%privacy_page_current%'
            then 'ok' else 'no' end
union all
select 'brands whose published Privacy Policy is on an older version (information)',
       coalesce((select string_agg(b.name, ', ' order by b.name)
                 from site_pages p
                 join brands b on b.id = p.brand_id
                 join compliance_templates t on t.key = p.template_key
                 where p.template_key = 'privacy' and p.status = 'published'
                   and coalesce(p.published_template_version, 0) <> t.version), 'none');
