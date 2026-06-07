-- Toilet Roll Sprint lives in its own `toilet_roll` schema (never public) so it
-- cannot touch the postly or live ordering tables sharing this Supabase project.
-- All app access is server-side via the service-role key (Netlify functions);
-- RLS is enabled with no anon/authenticated policy, so the browser can never
-- read sales or business figures directly — everything is mediated by the API.

create schema if not exists toilet_roll;

grant usage on schema toilet_roll to service_role;
grant all on all tables in schema toilet_roll to service_role;
grant all on all routines in schema toilet_roll to service_role;
grant all on all sequences in schema toilet_roll to service_role;
alter default privileges in schema toilet_roll grant all on tables to service_role;
alter default privileges in schema toilet_roll grant all on routines to service_role;
alter default privileges in schema toilet_roll grant all on sequences to service_role;

-- Salespeople — fixed roster for this promotion.
create table toilet_roll.salespeople (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null,
  sort_order integer not null default 0
);

-- Sales — manual entry, CSV import and (future) Sage sync all land here and feed
-- the same calculation pipeline. Dedupe live-sync rows on the Sage invoice line id.
create table toilet_roll.sales (
  id                   uuid primary key default gen_random_uuid(),
  sale_date            date not null default current_date,
  salesperson_id       uuid not null references toilet_roll.salespeople(id) on delete cascade,
  customer             text,
  cases                integer not null check (cases > 0),
  price_per_case       numeric(10,2) not null check (price_per_case > 0),
  source               text not null default 'manual'
                         check (source in ('manual','csv','sage')),
  sage_invoice_line_id text unique,
  created_at           timestamptz not null default now()
);
create index on toilet_roll.sales (salesperson_id);
create index on toilet_roll.sales (sale_date);

-- Configurable constants (cost base, promotion window). Business logic such as
-- the points tiers and bonus ladder lives in code (_shared/calc.ts).
create table toilet_roll.settings (
  key   text primary key,
  value text not null
);

insert into toilet_roll.salespeople (name, role, sort_order) values
  ('Katie', 'New Business', 1),
  ('Derry', 'New Business', 2),
  ('Donna', 'Existing Business', 3);

-- £3.66 ex-VAT per case is the cost base. Promotion dates are placeholders until
-- the client confirms the real window (open question in the brief).
insert into toilet_roll.settings (key, value) values
  ('cost_per_case', '3.66'),
  ('promo_start', '2026-06-01'),
  ('promo_end', '2026-06-28');

-- Lock the tables down: RLS on, no permissive policy, so only the service role
-- (used by the Netlify functions) can read or write. anon/authenticated get nothing.
alter table toilet_roll.salespeople enable row level security;
alter table toilet_roll.sales       enable row level security;
alter table toilet_roll.settings    enable row level security;

-- Expose the schema through PostgREST so the service-role client can reach it.
-- This is host-agnostic: if the project already pins the exposed schemas at the
-- `authenticator` role level (e.g. the postly project), we append `toilet_roll`
-- to whatever is already there. If exposure is platform-managed (no role-level
-- setting, e.g. WG Main), we leave it untouched and raise a notice — add
-- `toilet_roll` under Settings → API → Exposed schemas in the dashboard.
do $$
declare
  cfg text;
  cur text;
begin
  select array_to_string(rolconfig, E'\n') into cfg
    from pg_roles where rolname = 'authenticator';

  if cfg is not null and cfg ~ 'pgrst.db_schemas=' then
    cur := (regexp_match(cfg, 'pgrst\.db_schemas=([^\n]*)'))[1];
    if position('toilet_roll' in cur) = 0 then
      execute format(
        'alter role authenticator set pgrst.db_schemas = %L',
        trim(cur) || ', toilet_roll'
      );
      notify pgrst, 'reload config';
    end if;
  else
    raise notice 'pgrst.db_schemas is not set at the role level; add "toilet_roll" under Settings -> API -> Exposed schemas in the Supabase dashboard.';
  end if;
end $$;
