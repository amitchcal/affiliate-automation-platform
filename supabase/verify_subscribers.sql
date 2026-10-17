-- Email sign-up with recorded consent (S-08), migrations 0011 and 0012.
-- Run the whole file after applying 0012 (subscribe() is defined there). Every
-- row should read "ok"; the last row is information.
select 'subscribers and consent_texts exist with row-level security' as check,
       case when (select count(*) from pg_class where relname in ('subscribers', 'consent_texts')
                  and relnamespace = 'public'::regnamespace and relrowsecurity) = 2
            then 'ok' else 'missing' end as result
union all
select 'visitors have no access to subscribers',
       case when to_regclass('public.subscribers') is not null
             and not exists (select 1 from pg_policies where tablename = 'subscribers' and 'anon' = any (roles))
             and not has_table_privilege('anon', 'public.subscribers', 'select')
             and not has_table_privilege('anon', 'public.subscribers', 'insert')
            then 'ok' else 'no' end
union all
select 'no one inserts or updates subscribers directly (no policy)',
       case when not exists (select 1 from pg_policies where tablename = 'subscribers' and cmd in ('INSERT', 'UPDATE', 'ALL'))
             and to_regclass('public.subscribers') is not null
            then 'ok' else 'no' end
union all
select 'viewers cannot read emails: the read policy is for owner, operators and client admins',
       case when exists (select 1 from pg_policies where tablename = 'subscribers' and policyname = 'subscribers_read'
                         and qual like '%can_approve%')
            then 'ok' else 'no' end
union all
select 'visitors sign up only through subscribe() and read only the form wording',
       case when has_function_privilege('anon', 'public.subscribe(text, text, text, boolean, integer, text)', 'execute')
             and has_function_privilege('anon', 'public.public_signup(text)', 'execute')
             and not has_function_privilege('anon', 'public.set_signup(uuid, boolean)', 'execute')
             and not has_function_privilege('anon', 'public.subscriber_count(uuid)', 'execute')
            then 'ok' else 'no' end
union all
select 'the stored consent wording comes from consent_texts, not the request',
       case when pg_get_functiondef(to_regprocedure('public.subscribe(text, text, text, boolean, integer, text)')) like '%current_consent_text%'
            then 'ok' else 'no' end
union all
select 'the form names its consent version; a changed wording is refused',
       case when pg_get_functiondef(to_regprocedure('public.subscribe(text, text, text, boolean, integer, text)')) like '%signup_wording_changed%'
             and to_regprocedure('public.subscribe(text, text, text, boolean, text)') is null
            then 'ok' else 'no' end
union all
select 'sign-up works only while the Privacy Policy is current',
       case when pg_get_functiondef(to_regprocedure('public.signup_brand_for_host(text)')) like '%privacy_page_current%'
             and pg_get_functiondef(to_regprocedure('public.subscribe(text, text, text, boolean, integer, text)')) like '%signup_brand_for_host%'
             and pg_get_functiondef(to_regprocedure('public.public_signup(text)')) like '%signup_brand_for_host%'
            then 'ok' else 'no' end
union all
select 'a deleted subscriber leaves no email address in the audit log',
       case when exists (select 1 from pg_trigger where tgname = 'audit_subscribers_delete')
             and pg_get_functiondef(to_regprocedure('public.subscribers_audit_delete()')) not like '%old.email%'
             and pg_get_functiondef(to_regprocedure('public.subscribers_audit_delete()')) not like '%to_jsonb(old)%'
             and not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                             where t.tgrelid = 'public.subscribers'::regclass and p.proname = 'audit_row')
            then 'ok' else 'no' end
union all
select 'no IP address or browser details are stored',
       case when not exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'subscribers'
                               and column_name ~ '(^ip|_ip$|agent|browser)')
            then 'ok' else 'no' end
union all
select 'sign-up is off for every site until someone turns it on',
       case when (select column_default from information_schema.columns
                  where table_name = 'aff_sites' and column_name = 'signup_enabled') = 'false'
            then 'ok' else 'no' end
union all
select 'consent wording version 1 is present',
       case when exists (select 1 from consent_texts where key = 'email_signup' and version = 1
                         and body like 'Yes, email me updates from {{brand}}%')
            then 'ok' else 'missing' end
union all
select 'signed-in users have no insert, update or truncate on subscribers',
       case when not has_table_privilege('authenticated', 'public.subscribers', 'insert')
             and not has_table_privilege('authenticated', 'public.subscribers', 'update')
             and not has_table_privilege('authenticated', 'public.subscribers', 'truncate')
            then 'ok' else 'no' end
union all
select 'signed-in users have no update on brand_domains',
       case when not has_table_privilege('authenticated', 'public.brand_domains', 'update') then 'ok' else 'no' end
union all
select 'signed-in users have no insert, update or delete on aff_sites',
       case when not has_table_privilege('authenticated', 'public.aff_sites', 'insert')
             and not has_table_privilege('authenticated', 'public.aff_sites', 'update')
             and not has_table_privilege('authenticated', 'public.aff_sites', 'delete')
            then 'ok' else 'no' end
union all
select 'subscribers stored (information)', (select count(*)::text from subscribers);
