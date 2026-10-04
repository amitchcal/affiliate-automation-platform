-- Run after both migration files. Each row should read "ok".
select 'tables created' as check,
       case when count(*) = 11 then 'ok' else 'expected 11, found ' || count(*) end as result
from information_schema.tables
where table_schema = 'public'
  and table_name in ('clients','brands','memberships','approval_settings','scoring_configs',
                     'connections','offers','offer_metrics','offer_rules','tracked_links','audit_log')
union all
select 'row-level security on every table',
       case when count(*) = 11 then 'ok' else 'only ' || count(*) || ' of 11 protected' end
from pg_tables where schemaname = 'public' and rowsecurity
  and tablename in ('clients','brands','memberships','approval_settings','scoring_configs',
                    'connections','offers','offer_metrics','offer_rules','tracked_links','audit_log')
union all
select 'owner exists', case when count(*) = 1 then 'ok' else 'found ' || count(*) end
from memberships where role = 'owner'
union all
select 'first brand exists', case when count(*) = 1 then 'ok' else 'found ' || count(*) end
from brands where domain = 'affiqube.com'
union all
select 'approval settings', case when count(*) = 4 then 'ok' else 'found ' || count(*) end
from approval_settings
union all
select 'default scoring weights total 100',
       case when weights_total(weights) = 100 then 'ok' else 'total ' || weights_total(weights) end
from scoring_configs where client_id is null;
