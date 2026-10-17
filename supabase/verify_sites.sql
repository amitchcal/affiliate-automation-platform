-- Sites and domains (S-01), migration 0010.
--
-- Before applying 0010: 0008 and 0009 must be applied and their verify files
-- read ok. After applying 0010: run the whole file. Every row should read
-- "ok"; the last two rows are information.
select 'brand_domains and aff_sites exist with row-level security' as check,
       case when (select count(*) from pg_class where relname in ('brand_domains', 'aff_sites')
                  and relnamespace = 'public'::regnamespace and relrowsecurity) = 2
            then 'ok' else 'missing' end as result
union all
select 'nobody can update a host directly (no update policy)',
       case when not exists (select 1 from pg_policies where tablename = 'brand_domains' and cmd in ('UPDATE', 'ALL'))
             and to_regclass('public.brand_domains') is not null
            then 'ok' else 'no: brand_domains has an update policy, or is missing' end
union all
select 'aff_sites changes only through its functions (no write policy)',
       case when not exists (select 1 from pg_policies where tablename = 'aff_sites' and cmd <> 'SELECT')
             and to_regclass('public.aff_sites') is not null
            then 'ok' else 'no' end
union all
select 'one verified row per host, across all clients',
       case when exists (select 1 from pg_indexes where indexname = 'brand_domains_one_verified_idx'
                         and indexdef like '%UNIQUE%' and indexdef like '%verified%')
            then 'ok' else 'missing' end
union all
select 'hosts are checked: no IP addresses, internal or platform names',
       case when to_regprocedure('public.host_is_valid(text)') is not null
             and host_is_valid('brand-example.com') and not host_is_valid('1.2.3.4')
             and not host_is_valid('localhost') and not host_is_valid('app.affiqube.com')
            then 'ok' else 'no' end
union all
select 'only the server (service role) can record a domain check',
       case when to_regprocedure('public.record_domain_check(uuid, uuid, boolean, text)') is not null
             and has_function_privilege('service_role', 'public.record_domain_check(uuid, uuid, boolean, text)', 'execute')
             and not has_function_privilege('authenticated', 'public.record_domain_check(uuid, uuid, boolean, text)', 'execute')
             and not has_function_privilege('anon', 'public.record_domain_check(uuid, uuid, boolean, text)', 'execute')
            then 'ok' else 'no' end
union all
select 'going live checks the launch checklist; only owner and operators',
       case when pg_get_functiondef(to_regprocedure('public.go_live(uuid)')) like '%site_launch_checklist%'
             and pg_get_functiondef(to_regprocedure('public.go_live(uuid)')) like '%can_manage%'
            then 'ok' else 'missing' end
union all
select 'a live site''s standard pages cannot be unpublished or deleted',
       case when exists (select 1 from pg_trigger where tgname = 'site_pages_keep_standard_live')
            then 'ok' else 'missing' end
union all
select 'visitors see only verified hosts of live sites, matched exactly',
       case when pg_get_functiondef(to_regprocedure('public.site_brand_for_host(text)')) like '%''verified''%'
             and pg_get_functiondef(to_regprocedure('public.site_brand_for_host(text)')) like '%''live''%'
             and (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
                  and proname in ('public_brand', 'public_pages', 'public_page', 'record_click')
                  and pg_get_functiondef(oid) like '%_brand_for_host(%') = 4
            then 'ok' else 'no' end
union all
select 'previews need a member of the brand''s client; visitors cannot call them',
       case when (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
                  and proname in ('preview_brand', 'preview_pages', 'preview_page', 'preview_link')
                  and pg_get_functiondef(oid) like '%has_client_access%'
                  and not has_function_privilege('anon', oid, 'execute')) = 4
            then 'ok' else 'no' end
union all
select 'every function of 0010 fixes search_path to public, pg_temp',
       case when count(*) = 20 and count(*) filter (where proconfig @> array['search_path=public, pg_temp']) = 20
            then 'ok' else (count(*) - count(*) filter (where proconfig @> array['search_path=public, pg_temp'])) || ' of ' || count(*) || ' do not' end
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('host_is_valid', 'request_host', 'brand_domains_before_insert', 'can_check_domain', 'record_domain_check',
                  'site_launch_checklist', 'set_up_site', 'go_live', 'take_offline', 'site_brand_for_host',
                  'links_brand_for_host', 'public_brand', 'public_pages', 'public_page', 'record_click',
                  'preview_brand', 'preview_pages', 'preview_page', 'preview_link', 'site_pages_keep_standard_live')
union all
select 'sites live now (information; right after 0010 this is 0)',
       (select count(*)::text from aff_sites where status = 'live')
union all
select 'hosts waiting for a domain check (information)',
       coalesce((select string_agg(host, ', ' order by host) from brand_domains where status = 'pending'), 'none');
