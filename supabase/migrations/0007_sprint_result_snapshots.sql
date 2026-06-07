-- Locked final-results snapshots for the sales team.
--
-- Standings are normally recomputed live from sales. A snapshot freezes the
-- league table, dashboard, team challenge and director figures at a point in
-- time (e.g. when a sprint closes) so the published result never changes again,
-- even if data or config is later edited. Append-only: each row is immutable.

create table toilet_roll.campaign_results (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references toilet_roll.campaigns(id) on delete cascade,
  label        text not null default 'Final results',
  taken_by     text,
  standings    jsonb not null,   -- { table, dashboard, team } at snapshot time
  director     jsonb not null,   -- director figures (bonus liability, net profit…)
  config       jsonb not null,   -- the campaign config used, so it is self-describing
  snapshot_at  timestamptz not null default now()
);
create index on toilet_roll.campaign_results (campaign_id, snapshot_at desc);

grant all on toilet_roll.campaign_results to service_role;
alter table toilet_roll.campaign_results enable row level security;
