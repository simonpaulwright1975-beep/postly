-- TUMCH Social Autopilot — initial schema (brief §5)
-- RLS is enabled on every table. v1 is single-admin: any authenticated user
-- has full access. Structured so per-user/team policies can be added later.

create extension if not exists "pgcrypto";

-- ─── brand_profile (single row) ───────────────────────────────────────────
create table brand_profile (
  id            uuid primary key default gen_random_uuid(),
  voice         text not null default '',
  tone          text not null default '',
  audience      text not null default '',
  product_list  text not null default '',
  do_words      text not null default '',
  dont_words    text not null default '',
  updated_at    timestamptz not null default now()
);

-- ─── channels ───────────────────────────────────────────────────────────--
create table channels (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  display_name  text not null,
  provider_ref  text,
  status        text not null default 'disconnected',
  connected_at  timestamptz
);

-- ─── content_themes ───────────────────────────────────────────────────────
create table content_themes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);

-- ─── media_assets ─────────────────────────────────────────────────────────
create table media_assets (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null,
  source       text not null check (source in ('upload', 'camera', 'folder')),
  exif         jsonb,
  alt_text     text,
  ai_caption   text,
  created_at   timestamptz not null default now()
);

-- ─── posts ────────────────────────────────────────────────────────────────
create table posts (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'draft'
                   check (status in ('draft','scheduled','published','failed')),
  body           text not null default '',
  blog_body      text,
  media_asset_id uuid references media_assets(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ─── post_variants ────────────────────────────────────────────────────────
create table post_variants (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references posts(id) on delete cascade,
  platform      text not null,
  body          text not null default '',
  hashtags      text[] not null default '{}',
  scheduled_for timestamptz,
  published_at  timestamptz,
  external_id   text,
  status        text not null default 'draft'
                  check (status in ('draft','scheduled','published','failed')),
  error         text
);
create index on post_variants (post_id);
create index on post_variants (status, scheduled_for);

-- ─── post_metrics ─────────────────────────────────────────────────────────
create table post_metrics (
  id              uuid primary key default gen_random_uuid(),
  post_variant_id uuid not null references post_variants(id) on delete cascade,
  captured_at     timestamptz not null default now(),
  impressions     integer,
  reach           integer,
  likes           integer,
  comments        integer,
  shares          integer,
  clicks          integer,
  raw_json        jsonb
);
create index on post_metrics (post_variant_id, captured_at);

-- ─── ingest_queue ─────────────────────────────────────────────────────────
create table ingest_queue (
  id              uuid primary key default gen_random_uuid(),
  media_asset_id  uuid not null references media_assets(id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending','processing','done','failed')),
  requested_output text not null default 'post'
                    check (requested_output in ('post','blog','both')),
  result_post_id  uuid references posts(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ─── products ─────────────────────────────────────────────────────────────
create table products (
  id             uuid primary key default gen_random_uuid(),
  source         text not null default 'manual'
                   check (source in ('manual','static-html','shopify','woo','jsonld')),
  external_id    text,
  sku            text,
  title          text not null,
  description    text not null default '',
  price          numeric(10,2),
  currency       text not null default 'GBP',
  image_urls     text[] not null default '{}',
  stock          integer,
  url            text,
  last_synced_at timestamptz
);

-- ─── marketplace_listings ─────────────────────────────────────────────────
create table marketplace_listings (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products(id) on delete cascade,
  marketplace         text not null default 'ebay',
  status              text not null default 'draft'
                        check (status in ('draft','published','failed')),
  external_listing_id text,
  ebay_offer_id       text,
  title               text not null default '',
  description         text not null default '',
  price               numeric(10,2),
  published_at        timestamptz,
  error               text
);

-- ─── Row Level Security ─────────────────────────────────────────────────--
-- Enable RLS on every table and grant full access to authenticated users.
do $$
declare t text;
begin
  foreach t in array array[
    'brand_profile','channels','content_themes','media_assets','posts',
    'post_variants','post_metrics','ingest_queue','products','marketplace_listings'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;
