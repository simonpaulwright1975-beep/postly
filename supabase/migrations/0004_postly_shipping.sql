-- Shipping rate-card calculator tables. Records uploaded carrier rate cards,
-- the shipments ("boxes") priced against them, and competitor quotes used when
-- going out to tender. The nested object graph (ocean lanes, inland charges,
-- delivery tariff, variables) lives in a `data` jsonb column; `active` and
-- `created_at` are promoted to real columns for filtering/ordering.

create table postly.rate_cards (
  id         uuid primary key default gen_random_uuid(),
  active     boolean not null default false,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
-- At most one active (baseline) card at a time.
create unique index rate_cards_one_active on postly.rate_cards (active) where active;

create table postly.shipments (
  id         uuid primary key default gen_random_uuid(),
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table postly.competitor_quotes (
  id         uuid primary key default gen_random_uuid(),
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Row Level Security: single-admin app, full access to any authenticated user
-- (matches the policy applied to every other postly table).
do $$
declare t text;
begin
  foreach t in array array['rate_cards','shipments','competitor_quotes'] loop
    execute format('alter table postly.%I enable row level security;', t);
    execute format(
      'create policy %I on postly.%I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;
