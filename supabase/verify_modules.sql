-- Run after 0005_modules_and_test_brands.sql in the Supabase SQL editor.
-- Each row should read "ok", or says what is wrong.
select 'business type column on brands' as check,
       case when count(*) = 1 then 'ok' else 'column missing' end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'brands' and column_name = 'business_type'
union all
select 'module check function present',
       case when count(*) = 1 then 'ok' else 'brand_has_module missing' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'brand_has_module'
union all
select 'affiliate tables refuse brands without the module',
       case when count(*) = 5 then 'ok' else 'expected 5 triggers, found ' || count(*) end
from pg_trigger
where not tgisinternal and tgname in
  ('aff_module_offers', 'aff_module_offer_metrics', 'aff_module_offer_rules',
   'aff_module_tracked_links', 'aff_module_site_pages')
union all
select 'public site functions check the module',
       case when count(*) = 4 then 'ok' else 'only ' || count(*) || ' of 4 updated' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('public_brand', 'public_pages', 'public_page', 'record_click')
  and p.prosrc like '%brand_has_module%'
union all
select 'record_click still adds the tracking code',
       case when count(*) = 1 then 'ok' else 'record_click lost the tid logic' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'record_click' and p.prosrc like '%tracking_code%'
union all
select 'business type changes are logged',
       case when count(*) = 1 then 'ok' else 'audit trigger missing' end
from pg_trigger where not tgisinternal and tgname = 'audit_brands_business_type'
union all
select 'AffiQube brand removed',
       case when count(*) = 0 then 'ok' else count(*) || ' brand(s) still named AffiQube or on affiqube.com' end
from brands where lower(name) = 'affiqube' or domain = 'affiqube.com'
union all
select 'AffilyVault is affiliate marketing on affilyvault.com',
       case when count(*) = 1 then 'ok' else 'not found as expected' end
from brands
where id = '22222222-2222-4222-8222-222222222222'
  and name = 'AffilyVault' and domain = 'affilyvault.com' and business_type = 'affiliate'
union all
select 'Famperia is dropshipping on famperia.com, US',
       case when count(*) = 1 then 'ok' else 'not found as expected' end
from brands
where id = '33333333-3333-4333-8333-333333333333'
  and name = 'Famperia' and domain = 'famperia.com' and business_type = 'dropshipping'
  and target_country = 'US'
union all
select 'Famperia approval settings all approve first',
       case when count(*) = cardinality(enum_range(null::action_type))
             and count(*) filter (where mode = 'approve_first') = count(*)
            then 'ok' else 'found ' || count(*) || ' settings' end
from approval_settings where brand_id = '33333333-3333-4333-8333-333333333333'
union all
select 'ClickBank key belongs to AffilyVault',
       case when count(*) = 1 then 'ok' else 'connection row not on AffilyVault' end
from connections
where provider = 'clickbank' and secret_ref = 'env:CLICKBANK_API_KEY'
  and brand_id = '22222222-2222-4222-8222-222222222222'
union all
select 'Famperia serves no affiliate site',
       case when count(*) = 0 then 'ok' else 'public_brand still returns Famperia' end
from public_brand('famperia.com')
union all
select 'AffilyVault site is found by its domain',
       case when count(*) = 1 then 'ok' else 'public_brand found ' || count(*) end
from public_brand('www.affilyvault.com')
union all
select 'AffilyVault pages that still mention AffiQube',
       case when count(*) = 0 then 'ok'
            else 'review ' || count(*) || ' page(s): ' || string_agg(slug, ', ' order by slug) end
from site_pages
where brand_id = '22222222-2222-4222-8222-222222222222'
  and concat_ws(' ', title, summary, draft_body, published_title, published_summary, published_body)
      ilike '%affiqube%'
union all
select 'AffilyVault business details that still mention AffiQube',
       case when profile::text ilike '%affiqube%' then 'review the business details and headline' else 'ok' end
from brands where id = '22222222-2222-4222-8222-222222222222';
