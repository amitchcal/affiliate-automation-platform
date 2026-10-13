-- Run after 0004_results.sql in the Supabase SQL editor. Each row should read "ok".
select 'tracking_code column present' as check,
       case when count(*) = 1 then 'ok' else 'column missing' end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'tracked_links'
  and column_name = 'tracking_code'
union all
select 'tracking_code unique index present',
       case when count(*) = 1 then 'ok' else 'index missing' end
from pg_indexes
where schemaname = 'public' and tablename = 'tracked_links'
  and indexname = 'tracked_links_tracking_code_idx'
union all
select 'all existing links have an 8-character code',
       case when count(*) filter (where tracking_code !~ '^[0-9a-f]{8}$') = 0 then 'ok'
            else count(*) filter (where tracking_code !~ '^[0-9a-f]{8}$') || ' bad codes found' end
from tracked_links
union all
select 'network_sales table present',
       case when count(*) = 1 then 'ok' else 'table missing' end
from information_schema.tables
where table_schema = 'public' and table_name = 'network_sales'
union all
select 'network_sales RLS on',
       case when rowsecurity then 'ok' else 'RLS off' end
from pg_tables where schemaname = 'public' and tablename = 'network_sales'
union all
select 'network_sales unique key includes the transaction time',
       case when count(*) = 1 then 'ok' else 'old or missing unique key' end
from pg_constraint
where conname = 'network_sales_transaction_key'
  and pg_get_constraintdef(oid) like '%sale_date%'
union all
select 'record_click adds the tracking code',
       case when count(*) = 1 then 'ok' else 'record_click is the old version' end
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'record_click'
  and p.prosrc like '%tracking_code%'
union all
select 'ClickBank key assigned to Vividha Marketing',
       case when count(*) = 1 then 'ok' else 'connection row missing' end
from connections c join clients cl on cl.id = c.client_id
where c.provider = 'clickbank' and c.secret_ref = 'env:CLICKBANK_API_KEY'
  and cl.name = 'Vividha Marketing';
