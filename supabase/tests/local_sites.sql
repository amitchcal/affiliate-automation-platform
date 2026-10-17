-- Test stand-in, run after the migrations (scripts/test-db.sh), never on Supabase.
-- Makes a brand's site live on a verified host without the launch checklist or
-- a DNS check, so the suites written before 0010 keep testing what they test.
--
-- Guard: it refuses to run, and the helper refuses to work, unless the
-- database is one of the test runner's scratch databases (map_test_...).
\set ON_ERROR_STOP on
do $$
begin
  if current_database() not like 'map\_test\_%' then
    raise exception 'Stopped: local_sites.sql is a test helper and runs only in a scratch database named map_test_..., not in "%". Nothing was changed.', current_database();
  end if;
end $$;

create or replace function public.test_make_live(p_brand uuid, p_host text default null, p_purpose text default 'site')
returns void language plpgsql as $$
declare
  v_brand brands;
  v_host text;
begin
  if current_database() not like 'map\_test\_%' then
    raise exception 'Stopped: test_make_live works only in a map_test_ scratch database.';
  end if;
  select * into v_brand from brands where id = p_brand;
  v_host := request_host(coalesce(p_host, v_brand.domain));
  insert into aff_sites (brand_id, client_id, status, went_live_at)
  values (p_brand, v_brand.client_id, 'live', now())
  on conflict (brand_id) do update set status = 'live', went_live_at = now();
  insert into brand_domains (client_id, brand_id, host, purpose)
  values (v_brand.client_id, p_brand, v_host, p_purpose)
  on conflict (brand_id, host) do nothing;
  update brand_domains set status = 'verified', verified_at = now(), checked_at = now(), check_ok = true
   where brand_id = p_brand and host = v_host;
end;
$$;
