-- Run after 0003_site.sql. Each row should read "ok".
select 'site tables created' as check,
       case when count(*) = 3 then 'ok' else 'expected 3, found ' || count(*) end as result
from information_schema.tables
where table_schema = 'public' and table_name in ('compliance_templates', 'site_pages', 'click_events')
union all
select 'row-level security on the site tables',
       case when count(*) = 3 then 'ok' else 'only ' || count(*) || ' of 3 protected' end
from pg_tables
where schemaname = 'public' and rowsecurity
  and tablename in ('compliance_templates', 'site_pages', 'click_events')
union all
select 'compliance templates loaded',
       case when count(*) = 4 then 'ok' else 'found ' || count(*) end
from compliance_templates
union all
select 'public functions created',
       case when count(*) = 4 then 'ok' else 'found ' || count(*) end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('public_brand', 'public_pages', 'public_page', 'record_click')
union all
select 'visitors can call the public functions',
       case when has_function_privilege('anon', 'public_page(text, text)', 'execute')
             and has_function_privilege('anon', 'record_click(text, text, text, text)', 'execute')
            then 'ok' else 'anon role lacks execute' end
union all
select 'brand found by its domain',
       case when count(*) = 1 then 'ok' else 'found ' || count(*) end
from public_brand('www.affiqube.com');
