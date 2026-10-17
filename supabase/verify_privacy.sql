-- Run after 0007_privacy_template_wording.sql in the Supabase SQL editor.
-- Carriage returns are removed before comparing, so \r\n and \n line endings
-- read the same.
-- The first three rows should read "ok". The last row is information: brands'
-- Privacy Policy pages are copies made from the template, so 0007 does not
-- change them; each one listed needs the two lines added in the page editor
-- and then publishing.
select 'template: click line names the referring host' as check,
       case when position('the page it was on, the host name of the website you came from, and the time.' in replace(body, E'\r', '')) > 0
            then 'ok' else 'missing' end as result
from compliance_templates where key = 'privacy'
union all
select 'template: server-logs line present',
       case when position('- **Server logs kept by our providers.** Our hosting and database providers may keep standard server logs, which can include IP addresses, to run and secure the service.' in replace(body, E'\r', '')) > 0
            then 'ok' else 'missing' end
from compliance_templates where key = 'privacy'
union all
select 'template: old click line gone',
       case when position('the page it was on, and the time.' in replace(body, E'\r', '')) = 0
            then 'ok' else 'old wording still present' end
from compliance_templates where key = 'privacy'
union all
select 'brand Privacy pages still on the old wording (information)',
       case when count(*) = 0 then 'none'
            else count(*) || ': ' || string_agg(b.name || ' (' || p.status || ')', ', ' order by b.name) end
from site_pages p
join brands b on b.id = p.brand_id
where p.template_key = 'privacy'
  and (position('may keep standard server logs' in p.draft_body) = 0
       or position('may keep standard server logs' in coalesce(p.published_body, p.draft_body)) = 0);
