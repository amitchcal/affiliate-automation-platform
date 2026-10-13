-- Run after 0006_client_consistency.sql in the Supabase SQL editor.
-- Each row should read "ok", or says what is wrong.
select 'parent keys that include the client' as check,
       case when count(*) = 5 then 'ok' else 'expected 5, found ' || count(*) end as result
from pg_constraint
where contype = 'u' and conname in
  ('brands_id_client_key', 'offers_id_client_key', 'offers_id_brand_client_key',
   'tracked_links_id_client_key', 'tracked_links_id_client_brand_offer_key')
union all
select 'client-match constraints present',
       case when count(*) = 14 then 'ok' else 'expected 14, found ' || count(*) end
from pg_constraint
where conname like '%\_match' and connamespace = 'public'::regnamespace
union all
select 'client-match constraints checked against existing rows',
       case when count(*) filter (where not convalidated) = 0 then 'ok'
            else count(*) filter (where not convalidated) || ' not validated' end
from pg_constraint
where conname like '%\_match' and connamespace = 'public'::regnamespace
union all
select 'deleting a brand, offer or link keeps the sale and its client',
       case when count(*) = 3 then 'ok' else 'only ' || count(*) || ' of 3 clear a single column' end
from pg_constraint
where conrelid = 'network_sales'::regclass and conname like '%\_match'
  and confdeltype = 'n' and cardinality(confdelsetcols) = 1
union all
select 'visitors cannot call brand_has_module',
       case when has_function_privilege('anon', 'brand_has_module(uuid, text)', 'execute')
            then 'anon can still call it' else 'ok' end
union all
select 'signed-in users can call brand_has_module',
       case when has_function_privilege('authenticated', 'brand_has_module(uuid, text)', 'execute')
            then 'ok' else 'authenticated lost access' end;
