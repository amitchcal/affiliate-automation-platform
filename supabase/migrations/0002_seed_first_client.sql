-- =============================================================================
-- Seed: owner, first client, first brand, and the platform's default scoring
-- configuration.
--
-- Run AFTER 0001_core.sql, and AFTER creating your own user under
-- Authentication > Users in Supabase with the email below.
-- Safe to run more than once.
-- =============================================================================

-- 1. Make the signed-up user the platform owner (T-04).
insert into memberships (user_id, client_id, role)
select id, null, 'owner'
from auth.users
where email = 'amit.chakraborty@affilyvault.com'
  and not exists (
    select 1 from memberships m where m.user_id = auth.users.id and m.role = 'owner'
  );

do $$
begin
  if not exists (select 1 from memberships where role = 'owner') then
    raise exception 'No owner was created. Add the user amit.chakraborty@affilyvault.com under Authentication > Users first, then run this file again.';
  end if;
end $$;

-- 2. First client and first brand (T-01, C-01).
insert into clients (id, name)
values ('11111111-1111-4111-8111-111111111111', 'Vividha Marketing')
on conflict (id) do nothing;

insert into brands (id, client_id, name, domain, target_country)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'AffiQube',
  'affiqube.com',
  'US'
)
on conflict (id) do nothing;

-- 3. Every action starts as approve-first for this brand (C-06).
insert into approval_settings (brand_id, client_id, action, mode)
select '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', a, 'approve_first'
from unnest(enum_range(null::action_type)) as a
on conflict (brand_id, action) do nothing;

-- 4. Platform default scoring configuration (C-08).
insert into scoring_configs (client_id, brand_id, weights, scales, minimum_score, minimum_gravity, expected_cost_per_click)
select
  null, null,
  '{"epc":25,"payout":15,"conversionRate":15,"complianceRisk":15,"gravity":10,"sellerRestrictions":10,"recurring":5,"refundRate":5}'::jsonb,
  '{"epc":{"zero":0,"full":1.0},"payout":{"zero":0,"full":60},"conversionRate":{"zero":0,"full":2.0},"gravity":{"zero":0,"full":50},"refundRate":{"zero":20,"full":0}}'::jsonb,
  30, 1, 0.80
where not exists (select 1 from scoring_configs where client_id is null and brand_id is null);
