-- =============================================================================
-- Marketing Automation Platform: core schema
-- Slice 1 foundation. Each object notes the story it serves.
--
-- Conventions
--   * Every client-owned row carries client_id (T-01).
--   * Row-level security is on for every table; access is decided by the
--     helper functions below, never by the application alone (T-02).
--   * Agents run on the server with the service role, which bypasses these
--     policies. Agent code must therefore scope every query by client_id and
--     write through the same tables so the audit triggers fire.
-- =============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------
create type app_role as enum ('owner', 'operator', 'client_admin', 'client_viewer');
create type approval_mode as enum ('automatic', 'approve_first');
create type action_type as enum ('publish_page', 'publish_article', 'launch_campaign', 'raise_budget');
create type offer_status as enum ('draft', 'scored', 'approved', 'rejected', 'retired');
create type offer_source as enum ('suggested', 'client_supplied');
create type risk_level as enum ('low', 'medium', 'high');
create type channel as enum ('paid', 'organic', 'reject', 'needs_data');

-- ----------------------------------------------------------------------------
-- Tenancy (T-01, T-02, T-04)
-- ----------------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- A brand is one site on one domain, belonging to one client (C-01).
create table brands (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  domain text not null unique,
  niche text,                                  -- chosen by the client (O-01)
  platforms text[] not null default '{}',      -- chosen by the client (O-07)
  target_country text,
  profile jsonb not null default '{}'::jsonb,  -- colours, logo, voice (C-01)
  created_at timestamptz not null default now()
);
create index brands_client_idx on brands (client_id);

-- One row per user per client. The owner has a single row with no client:
-- that row is the master access in T-04.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references clients (id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  constraint owner_has_no_client check ((role = 'owner') = (client_id is null))
);
create unique index memberships_user_client_idx
  on memberships (user_id, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ----------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so they can read memberships without
-- tripping that table's own policies.
-- ----------------------------------------------------------------------------
create function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships where user_id = auth.uid() and role = 'owner'
  );
$$;

create function has_client_access(target_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or exists (
    select 1 from memberships where user_id = auth.uid() and client_id = target_client
  );
$$;

-- Owner and operators: may create and change a client's working data.
create function can_manage(target_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or exists (
    select 1 from memberships
    where user_id = auth.uid() and client_id = target_client and role = 'operator'
  );
$$;

-- Owner, operators and the client's own admin: may select and approve offers.
create function can_approve(target_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or exists (
    select 1 from memberships
    where user_id = auth.uid() and client_id = target_client
      and role in ('operator', 'client_admin')
  );
$$;

-- ----------------------------------------------------------------------------
-- Configuration (C-05, C-06, C-08)
-- ----------------------------------------------------------------------------

-- Approval mode per action type per brand (C-06). Absent row = approve first.
create table approval_settings (
  brand_id uuid not null references brands (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  action action_type not null,
  mode approval_mode not null default 'approve_first',
  primary key (brand_id, action)
);

create function weights_total(weights jsonb) returns numeric
language sql immutable as $$
  select coalesce(sum(value::numeric), 0) from jsonb_each_text(weights);
$$;

-- Scoring weights and thresholds (C-08). client_id null = platform default.
create table scoring_configs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id) on delete cascade,
  brand_id uuid references brands (id) on delete cascade,
  weights jsonb not null,
  scales jsonb not null,
  level_scores jsonb not null default '{"low":100,"medium":50,"high":0}'::jsonb,
  minimum_score integer not null default 30,
  minimum_gravity numeric not null default 1,
  expected_cost_per_click numeric not null check (expected_cost_per_click > 0),
  updated_at timestamptz not null default now(),
  constraint weights_total_100 check (weights_total(weights) = 100)
);
create unique index scoring_configs_scope_idx on scoring_configs (
  coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- Connections to networks and ad accounts (C-05). Only a reference to the
-- secret is stored here; the secret itself lives in the server-side vault.
create table connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  brand_id uuid not null references brands (id) on delete cascade,
  provider text not null,       -- e.g. 'clickbank', 'meta_ads'
  account_ref text not null,    -- e.g. affiliate nickname or ad account id
  secret_ref text,              -- vault key name, never the secret value
  created_at timestamptz not null default now(),
  unique (brand_id, provider)
);

-- ----------------------------------------------------------------------------
-- Offers (O-02, O-03, O-05, O-06, O-08, C-03)
-- ----------------------------------------------------------------------------
create table offers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  brand_id uuid not null references brands (id) on delete cascade,
  name text not null,
  network text not null,
  seller_ref text,
  affiliate_link text,
  sales_page_url text,
  source offer_source not null default 'suggested',
  status offer_status not null default 'draft',
  -- Filled by the scoring engine (O-03).
  score integer check (score between 0 and 100),
  channel channel,
  break_even_cpc numeric,
  explanation text,
  provisional boolean not null default true,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index offers_brand_idx on offers (brand_id);

-- Marketplace figures, each dated (O-02: "each figure carries its date").
create table offer_metrics (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  captured_on date not null default current_date,
  payout numeric,
  conversion_rate numeric,
  epc numeric,
  gravity numeric,
  refund_rate numeric,
  recurring boolean,
  unique (offer_id, captured_on)
);

-- The seller's promotion rules for one offer (C-03).
create table offer_rules (
  offer_id uuid primary key references offers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  terms_url text,
  compliance_risk risk_level,
  seller_restrictions risk_level,
  rules jsonb not null default '[]'::jsonb,   -- [{ "rule": "...", "source": "..." }]
  banned_claims text[] not null default '{}',
  permitted_images text[] not null default '{}',
  approved boolean not null default false,
  approved_by uuid,
  approved_at timestamptz
);

-- An offer may be approved only once its rules record is approved (C-03, O-05).
create function enforce_offer_approval() returns trigger
language plpgsql as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    if not exists (
      select 1 from offer_rules where offer_id = new.id and approved
    ) then
      raise exception 'Offer % cannot be approved: it has no approved rules record.', new.name;
    end if;
    new.approved_by := coalesce(new.approved_by, auth.uid());
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end;
$$;
create trigger offers_enforce_approval
  before update on offers
  for each row execute function enforce_offer_approval();

-- Tracked links (O-06). Created only for approved offers (O-05).
create table tracked_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  brand_id uuid not null references brands (id) on delete cascade,
  offer_id uuid not null references offers (id) on delete cascade,
  slug text not null,
  destination text not null,
  channel text not null,     -- e.g. 'site', 'pinterest', 'meta'
  campaign text,
  creative text,
  created_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create function enforce_offer_usable() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from offers where id = new.offer_id and status = 'approved') then
    raise exception 'Offer is not approved, so it cannot be used.';
  end if;
  return new;
end;
$$;
create trigger tracked_links_offer_usable
  before insert on tracked_links
  for each row execute function enforce_offer_usable();

-- ----------------------------------------------------------------------------
-- Audit log (T-06). Append-only: no update or delete policy exists.
-- ----------------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  client_id uuid,
  actor_id uuid,
  actor_type text not null default 'user' check (actor_type in ('user', 'agent')),
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_client_idx on audit_log (client_id, created_at desc);

create function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log (client_id, actor_id, actor_type, action, entity, entity_id, before, after)
  values (
    (row_data ->> 'client_id')::uuid,
    auth.uid(),
    case when auth.uid() is null then 'agent' else 'user' end,
    lower(tg_op),
    tg_table_name,
    coalesce(row_data ->> 'id', row_data ->> 'offer_id', row_data ->> 'brand_id'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_scoring_configs after insert or update or delete on scoring_configs
  for each row execute function audit_row();
create trigger audit_approval_settings after insert or update or delete on approval_settings
  for each row execute function audit_row();
create trigger audit_offers after update or delete on offers
  for each row execute function audit_row();
create trigger audit_offer_rules after insert or update or delete on offer_rules
  for each row execute function audit_row();
create trigger audit_connections after insert or update or delete on connections
  for each row execute function audit_row();

-- ----------------------------------------------------------------------------
-- Row-level security (T-02)
-- ----------------------------------------------------------------------------
alter table clients enable row level security;
alter table brands enable row level security;
alter table memberships enable row level security;
alter table approval_settings enable row level security;
alter table scoring_configs enable row level security;
alter table connections enable row level security;
alter table offers enable row level security;
alter table offer_metrics enable row level security;
alter table offer_rules enable row level security;
alter table tracked_links enable row level security;
alter table audit_log enable row level security;

-- clients: members read their own; only the owner writes.
create policy clients_read on clients for select using (has_client_access(id));
create policy clients_write on clients for all using (is_owner()) with check (is_owner());

-- memberships: a user sees their own rows; the owner sees and manages all.
create policy memberships_read on memberships for select
  using (user_id = auth.uid() or is_owner());
create policy memberships_write on memberships for all using (is_owner()) with check (is_owner());

-- brands and working data: members read; owner and operators write.
create policy brands_read on brands for select using (has_client_access(client_id));
create policy brands_write on brands for all using (can_manage(client_id)) with check (can_manage(client_id));

create policy approval_read on approval_settings for select using (has_client_access(client_id));
create policy approval_write on approval_settings for all using (can_manage(client_id)) with check (can_manage(client_id));

-- scoring configs: the platform default (no client) is readable by any
-- signed-in user and writable only by the owner.
create policy scoring_read on scoring_configs for select
  using (auth.uid() is not null and (client_id is null or has_client_access(client_id)));
create policy scoring_write on scoring_configs for all
  using (case when client_id is null then is_owner() else can_manage(client_id) end)
  with check (case when client_id is null then is_owner() else can_manage(client_id) end);

-- connections: never visible to client roles (C-05).
create policy connections_all on connections for all
  using (can_manage(client_id)) with check (can_manage(client_id));

-- offers: members read; client admins may add their own and approve (O-05, O-08).
create policy offers_read on offers for select using (has_client_access(client_id));
create policy offers_insert on offers for insert with check (can_approve(client_id));
create policy offers_update on offers for update using (can_approve(client_id)) with check (can_approve(client_id));
create policy offers_delete on offers for delete using (can_manage(client_id));

create policy metrics_read on offer_metrics for select using (has_client_access(client_id));
create policy metrics_write on offer_metrics for all using (can_approve(client_id)) with check (can_approve(client_id));

create policy rules_read on offer_rules for select using (has_client_access(client_id));
create policy rules_write on offer_rules for all using (can_manage(client_id)) with check (can_manage(client_id));

create policy links_read on tracked_links for select using (has_client_access(client_id));
create policy links_write on tracked_links for all using (can_manage(client_id)) with check (can_manage(client_id));

-- audit log: readable by those who can approve; written only by triggers.
create policy audit_read on audit_log for select using (can_approve(client_id));
