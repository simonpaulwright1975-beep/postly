-- Turn the single Toilet Roll Sprint into a reusable campaign template:
-- every per-promotion detail (product, cost base, dates, branding, points
-- bands, bonus ladder, team target) becomes a row in toilet_roll.campaigns, and
-- salespeople + sales are scoped to a campaign. New promotions are new rows in
-- the same schema/site/database — no new project required.

create table toilet_roll.campaigns (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,
  status               text not null default 'active'
                         check (status in ('active','draft','archived')),
  product_name         text not null default 'Case',
  units_per_case       integer not null default 1,
  cost_per_case        numeric(10,2) not null default 0,
  price_guidance       text,
  promo_start          date,
  promo_end            date,
  -- Branding (hero): kicker + title with one accent word + subtitle.
  hero_kicker          text not null default '4-Week Promotion',
  hero_title           text not null default 'Sprint',
  hero_accent          text not null default '',
  subtitle             text not null default '',
  -- Scoring config (JSON so each campaign can differ without code changes).
  margin_tiers         jsonb not null,
  bonus_ladder         jsonb not null,
  max_individual_bonus numeric(10,2) not null default 250,
  team_points_target   numeric(10,2) not null default 2500,
  team_bonus_each      numeric(10,2) not null default 50,
  created_at           timestamptz not null default now()
);

grant all on toilet_roll.campaigns to service_role;
alter table toilet_roll.campaigns enable row level security;

-- Seed the original Toilet Roll Sprint as the first campaign, carrying over the
-- cost base and dates previously held in the settings table.
insert into toilet_roll.campaigns (
  slug, name, status, product_name, units_per_case, cost_per_case,
  promo_start, promo_end, hero_kicker, hero_title, hero_accent, subtitle,
  margin_tiers, bonus_ladder, max_individual_bonus, team_points_target, team_bonus_each
)
values (
  'toilet-roll',
  'Toilet Roll Sprint',
  'active',
  'Toilet Roll Case',
  24,
  3.66,
  '2026-06-01',
  '2026-06-28',
  '4-Week Promotion',
  'Toilet Roll',
  'Sprint',
  'Sell more, earn more — every case counts.',
  '[{"minMargin":46,"multiplier":1,"label":"46% and above"},
    {"minMargin":43,"multiplier":0.9,"label":"43% – 45.99%"},
    {"minMargin":40,"multiplier":0.75,"label":"40% – 42.99%"},
    {"minMargin":35,"multiplier":0.5,"label":"35% – 39.99%"},
    {"minMargin":0,"multiplier":0,"label":"Below 35%"}]'::jsonb,
  '[{"points":300,"bonus":50},{"points":500,"bonus":100},
    {"points":750,"bonus":175},{"points":1000,"bonus":250}]'::jsonb,
  250, 2500, 50
);

-- Scope salespeople and sales to a campaign, backfilling the existing rows onto
-- the seeded Toilet Roll Sprint campaign.
alter table toilet_roll.salespeople
  add column campaign_id uuid references toilet_roll.campaigns(id) on delete cascade;
alter table toilet_roll.sales
  add column campaign_id uuid references toilet_roll.campaigns(id) on delete cascade;

update toilet_roll.salespeople
  set campaign_id = (select id from toilet_roll.campaigns where slug = 'toilet-roll')
  where campaign_id is null;
update toilet_roll.sales
  set campaign_id = (select id from toilet_roll.campaigns where slug = 'toilet-roll')
  where campaign_id is null;

alter table toilet_roll.salespeople alter column campaign_id set not null;
alter table toilet_roll.sales       alter column campaign_id set not null;

create index on toilet_roll.salespeople (campaign_id);
create index on toilet_roll.sales (campaign_id);
