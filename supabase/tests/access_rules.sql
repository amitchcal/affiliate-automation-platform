-- =============================================================================
-- Access-rule tests. Run after 0001_core.sql against a scratch database.
-- Each DO block raises an exception if an expectation fails, so a clean run
-- to the final NOTICE means every rule held.
--
-- Users
--   owner      00000000-0000-0000-0000-0000000000a0   master access
--   a_admin    ...a1   client admin of client A
--   a_viewer   ...a2   client viewer of client A
--   b_admin    ...b1   client admin of client B
-- =============================================================================
\set ON_ERROR_STOP on

-- ---------- seed (as superuser, bypassing policies) ----------
insert into clients (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Client A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Client B');

insert into memberships (user_id, client_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', null, 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000000', 'client_viewer'),
  ('00000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000000', 'client_admin');

insert into brands (id, client_id, name, domain) values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'Brand A', 'brand-a.test'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'Brand B', 'brand-b.test');

insert into offers (id, client_id, brand_id, name, network) values
  ('aaaaaaaa-2222-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'Offer A', 'clickbank'),
  ('bbbbbbbb-2222-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000', 'Offer B', 'clickbank');

insert into connections (client_id, brand_id, provider, account_ref, secret_ref) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'clickbank', 'nickname-a', 'vault/clickbank-a');

-- Helper: act as a signed-in user for the rest of the transaction.
create or replace function test_login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end;
$$;

-- ---------- T-02: a client sees only its own rows ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a1');
do $$
begin
  if (select count(*) from brands) <> 1 then raise exception 'T-02: client A admin should see exactly one brand'; end if;
  if (select count(*) from offers) <> 1 then raise exception 'T-02: client A admin should see exactly one offer'; end if;
  if exists (select 1 from offers where name = 'Offer B') then raise exception 'T-02: client A can read client B offer'; end if;
  if (select count(*) from clients) <> 1 then raise exception 'T-02: client A admin should see one client'; end if;
end $$;
rollback;

-- ---------- T-02: a client cannot write into another client ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000b1');
do $$
begin
  begin
    insert into offers (client_id, brand_id, name, network)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'Intruder', 'clickbank');
    raise exception 'T-02: client B inserted an offer into client A';
  exception when insufficient_privilege then null;
  end;
  update offers set name = 'Hijacked' where id = 'aaaaaaaa-2222-0000-0000-000000000000';
  if found then raise exception 'T-02: client B updated a client A offer'; end if;
end $$;
rollback;

-- ---------- T-02: a viewer can read but not change ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a2');
do $$
begin
  if (select count(*) from offers) <> 1 then raise exception 'viewer should read own offer'; end if;
  update offers set name = 'Changed' where id = 'aaaaaaaa-2222-0000-0000-000000000000';
  if found then raise exception 'T-02: viewer updated an offer'; end if;
end $$;
rollback;

-- ---------- C-05: connections are hidden from client roles ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a1');
do $$
begin
  if (select count(*) from connections) <> 0 then raise exception 'C-05: client admin can see connections'; end if;
end $$;
rollback;

-- ---------- T-04: the owner sees every client ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a0');
do $$
begin
  if (select count(*) from brands) <> 2 then raise exception 'T-04: owner should see both brands'; end if;
  if (select count(*) from connections) <> 1 then raise exception 'T-04: owner should see connections'; end if;
end $$;
rollback;

-- ---------- C-03 / O-05: no approval without an approved rules record ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a0');
do $$
begin
  begin
    update offers set status = 'approved' where id = 'aaaaaaaa-2222-0000-0000-000000000000';
    raise exception 'C-03: offer approved without a rules record';
  exception when raise_exception then
    if sqlerrm not like '%no approved rules record%' then raise; end if;
  end;

  begin
    insert into tracked_links (client_id, brand_id, offer_id, slug, destination, channel)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000',
            'aaaaaaaa-2222-0000-0000-000000000000', 'offer-a', 'https://example.test', 'site');
    raise exception 'O-05: tracked link created for an unapproved offer';
  exception when raise_exception then
    if sqlerrm not like '%not approved%' then raise; end if;
  end;

  -- Record and approve the rules, then approval and link creation succeed.
  insert into offer_rules (offer_id, client_id, compliance_risk, seller_restrictions, approved)
  values ('aaaaaaaa-2222-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'low', 'low', true);
  update offers set status = 'approved' where id = 'aaaaaaaa-2222-0000-0000-000000000000';
  insert into tracked_links (client_id, brand_id, offer_id, slug, destination, channel)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000',
          'aaaaaaaa-2222-0000-0000-000000000000', 'offer-a', 'https://example.test', 'site');

  if (select approved_by from offers where id = 'aaaaaaaa-2222-0000-0000-000000000000')
       <> '00000000-0000-0000-0000-0000000000a0' then
    raise exception 'O-05: approver was not recorded';
  end if;

  -- T-06: the approval is in the audit log with the actor and before/after.
  if not exists (
    select 1 from audit_log
    where entity = 'offers' and action = 'update'
      and actor_id = '00000000-0000-0000-0000-0000000000a0'
      and before ->> 'status' = 'draft' and after ->> 'status' = 'approved'
  ) then raise exception 'T-06: offer approval missing from the audit log'; end if;
end $$;
rollback;

-- ---------- C-08: weights must total 100, and changes are audited ----------
begin;
select test_login('00000000-0000-0000-0000-0000000000a0');
do $$
declare
  good jsonb := '{"epc":25,"payout":15,"conversionRate":15,"complianceRisk":15,"gravity":10,"sellerRestrictions":10,"recurring":5,"refundRate":5}';
  bad jsonb := '{"epc":30,"payout":15,"conversionRate":15,"complianceRisk":15,"gravity":10,"sellerRestrictions":10,"recurring":5,"refundRate":5}';
begin
  begin
    insert into scoring_configs (weights, scales, expected_cost_per_click) values (bad, '{}', 0.8);
    raise exception 'C-08: weights totalling 105 were accepted';
  exception when check_violation then null;
  end;

  insert into scoring_configs (weights, scales, expected_cost_per_click) values (good, '{}', 0.8);
  update scoring_configs set expected_cost_per_click = 0.6 where client_id is null;

  if not exists (
    select 1 from audit_log
    where entity = 'scoring_configs' and action = 'update'
      and before ->> 'expected_cost_per_click' = '0.8'
      and after ->> 'expected_cost_per_click' = '0.6'
  ) then raise exception 'C-08: scoring change missing from the audit log'; end if;
end $$;
rollback;

-- ---------- C-08: a client cannot change the platform default ----------
begin;
insert into scoring_configs (weights, scales, expected_cost_per_click)
values ('{"epc":100}', '{}', 0.8);
select test_login('00000000-0000-0000-0000-0000000000a1');
do $$
begin
  update scoring_configs set expected_cost_per_click = 9 where client_id is null;
  if found then raise exception 'C-08: client admin changed the platform default'; end if;
end $$;
rollback;

-- ---------- T-06: the audit log cannot be altered ----------
begin;
update offers set name = 'Offer A renamed' where id = 'aaaaaaaa-2222-0000-0000-000000000000';
select test_login('00000000-0000-0000-0000-0000000000a0');
do $$
begin
  if (select count(*) from audit_log) = 0 then raise exception 'T-06: owner cannot read the audit log'; end if;
  update audit_log set action = 'tampered';
  if found then raise exception 'T-06: audit log was updated'; end if;
  delete from audit_log;
  if found then raise exception 'T-06: audit log was deleted'; end if;
end $$;
rollback;

-- ---------- C-08: a request with no signed-in user reads nothing ----------
begin;
insert into scoring_configs (weights, scales, expected_cost_per_click)
values ('{"epc":100}', '{}', 0.8);
set local role authenticated;
do $$
begin
  if (select count(*) from scoring_configs) <> 0 then raise exception 'C-08: unsigned request can read the scoring configuration'; end if;
  if (select count(*) from brands) <> 0 then raise exception 'T-02: unsigned request can read brands'; end if;
end $$;
rollback;

\echo 'ALL ACCESS RULE TESTS PASSED'
