# Toilet Roll Sprint

A 4-week toilet-roll sales-promotion app for a small sales team, built from the
brief in this repo. It is a **hosted full-stack app**: a static mobile-first
frontend, a serverless backend, and a Postgres database — all server-computed so
every phone stays in sync, with the Director figures gated behind a real
server-side login.

It is deliberately **self-contained and non-destructive**: it lives in its own
Supabase schema (`toilet_roll`), its own Netlify functions (`sprint-*`) and its
own page. It does **not** touch the existing `postly` app sharing this repo.

> **Note on the prototype:** the brief refers to a `toilet-roll-sprint.html`
> prototype as the source of truth for visuals and calculations. That file was
> **not present** in the repo or its git history, so this build follows the
> brief's written spec (Sections 4, 5, 9). The design system (Section 9) and all
> formulas (Section 4) are implemented to spec. Rounding: money to 2dp; per-sale
> points = `round2(GP) × multiplier`, summed at full precision; bonus thresholds
> compared against the summed total. If the original prototype rounds points
> differently, adjust `round2` usage in `netlify/functions/_shared/calc.ts`.

## Where things live

It is also a **campaign template**: the Toilet Roll Sprint is just the first
campaign. Every per-promotion detail (product, cost base, dates, branding,
points bands, bonus ladder, team target) is a row in `toilet_roll.campaigns`, so
new promotions are new rows in the same repo / site / database — no new project.

| Piece | Path |
| --- | --- |
| Frontend (landing + campaign app + admin) | `public/sprint.html` |
| Old page (redirects to the campaign) | `public/toilet-roll-sprint.html` |
| Calculation engine (source of truth, config-driven) | `netlify/functions/_shared/calc.ts` |
| DB access (service-role, schema-scoped, campaign-aware) | `netlify/functions/_shared/db.ts` |
| Director auth (server-side PIN + token) | `netlify/functions/_shared/auth.ts` |
| API: league + dashboard + campaign config | `netlify/functions/sprint-standings.ts` |
| API: campaign list / single config | `netlify/functions/sprint-campaigns.ts` |
| API: sales CRUD | `netlify/functions/sprint-sales.ts` |
| API: CSV import | `netlify/functions/sprint-import.ts` |
| API: director login + figures | `netlify/functions/sprint-director.ts` |
| API: admin (create/edit campaign, manage roster) | `netlify/functions/sprint-admin.ts` |
| Schema + seed (single campaign) | `supabase/migrations/0004_toilet_roll_sprint.sql` |
| Campaign template tables + backfill | `supabase/migrations/0005_sprint_campaigns.sql` |

Every API call is scoped by `?campaign=<slug>`; omit it and the first active
campaign is used.

## Screens

Bottom tab bar, four sections (matching the brief):

1. **Table** — public dashboard strip + live league table.
2. **Log Sale** — entry form with live preview, CSV import, recent entries (delete).
3. **Earn** — points tiers, bonus ladder, the self-funding golden rule, team challenge.
4. **Director** — server-login-gated business / self-funding figures.

## How the numbers work

All defined in `_shared/calc.ts` and verified against the brief:

- `Sales Value = cases × price`, `Cost = cases × 3.66`, `GP = Sales − Cost`,
  `Margin% = GP ÷ Sales × 100`.
- `Points = GP × multiplier`, multiplier by margin band: ≥46% → 100%, 43–45.99% →
  90%, 40–42.99% → 75%, 35–39.99% → 50%, below 35% → 0.
- Bonus ladder (highest reached, cap £250): 300→£50, 500→£100, 750→£175, 1000→£250.
- League ranking tie-breakers: points, GP, average margin, cases (all highest-first).
- Average margin is **value-weighted** (`Σ GP ÷ Σ Sales × 100`).
- Team challenge: 2,500 team points unlocks **£50 each → £150 total**.
- Director: total bonus liability, **net profit after bonuses = total GP − total
  bonus payable**, and a plain-English self-funding check that flags if bonuses
  ever exceed GP.

## Security

- Director figures are **computed and returned only after** the PIN is validated
  server-side (`sprint-director.ts`). They are never shipped to an
  unauthenticated client — unlike the prototype's client-side PIN gate where the
  numbers sat in the page source.
- The PIN (`DIRECTOR_PIN`, default `01237470990`) is validated on the server; a
  short-lived HMAC-signed token authorises the figures endpoint.
- The browser never holds DB credentials. All access is via the service-role key
  in the functions, and the `toilet_roll` tables have RLS enabled with no
  anon/authenticated policy, so they cannot be read directly with the public key.

## Setup & deploy

1. **Database.** Apply migrations `0004_toilet_roll_sprint.sql` **and**
   `0005_sprint_campaigns.sql` to the Supabase project this app should use. (Not
   auto-applied — this repo is linked to more than one Supabase project, so pick
   the right one deliberately.) Together they create the isolated `toilet_roll`
   schema, the `campaigns` table, seed the Toilet Roll Sprint campaign with its
   salespeople, and expose the schema to PostgREST.
2. **Environment variables** (Netlify → site settings, or `.env` for
   `netlify dev`):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
   - `DIRECTOR_PIN` (optional; defaults to the brief's PIN)
   - `DIRECTOR_TOKEN_SECRET` (set a long random value in production)
3. **Run locally:** `npm run dev:netlify` then open `http://localhost:8888/sprint`
   (landing) or `/sprint?campaign=toilet-roll`.
4. **Deploy:** `npm run build` (Netlify runs this). The app is served at `/sprint`,
   with each campaign at `/sprint?campaign=<slug>`.

## Configurable per campaign (no code changes)

All of this lives on the campaign row and is editable from the Director admin
panel (or directly in `toilet_roll.campaigns`): cost base, product name/units,
promotion dates, branding (hero kicker/title/accent/subtitle), price guidance,
margin multiplier bands, bonus ladder, max individual bonus, team target and team
bonus. Salespeople are rows in `toilet_roll.salespeople` scoped to the campaign.
The Director PIN is the `DIRECTOR_PIN` env var. The defaults in `_shared/calc.ts`
(`DEFAULT_CONFIG`) are only a fallback when a campaign omits a value.

## Reusing as a template (multi-product / multi-campaign)

This is implemented: **one deployment, many campaigns.**

- The **landing page** (`/sprint`, no campaign) lists active campaigns. Each is a
  stable deep-link — `/sprint?campaign=<slug>` — ready to pin to a WGHUB card or
  the Opportunities tab.
- Open any campaign, log in as Director, and use **Manage This Sprint** to:
  - add/remove salespeople for that campaign,
  - edit every detail (name, status, product, cost, dates, branding, team
    target, max bonus, and the margin tiers / bonus ladder as JSON),
  - **create a new sprint** (it inherits this one's scoring, which you can edit).
- New promotions are new rows in `toilet_roll.campaigns` — same repo, same Netlify
  site, same database. Nothing here affects the other apps in the repo, because
  everything stays namespaced to the `toilet_roll` schema and `sprint-*` functions.

## Promotion lifecycle (create → close → archive → run again)

All from the Director tab (PIN-gated) → **Manage This Sprint**:

- **Create** a new promotion ("Create a new sprint") — a new `campaigns` row with
  its own `/sprint?campaign=<slug>` link, inheriting the current scoring.
- **Data & results persist.** Every sale is stored in `toilet_roll.sales`;
  standings and director figures are recomputed from those stored sales, so a
  finished promotion's numbers are preserved and reproducible. Because each month
  is its own campaign, running a new one never changes an old one's results.
- **Archive** via the status field (active / draft / archived). Archived sprints
  drop off the default landing list (find them with "Show archived sprints") but
  keep all their data; they stay reachable by their direct link.
- **Run again** ("Run this sprint again") clones a promotion — product, cost,
  branding, scoring and (optionally) the salespeople — into a fresh active
  campaign with new dates and a clean league. The source is untouched, so you
  archive the old month and start the new one in one click. The marketing code is
  intentionally not carried over, so each run is tagged with a fresh code.

## Marketing-app integration (marketing code + ROI)

The Sprint hosts its `toilet_roll` schema **in the WG Main database** (alongside
the marketing app), so the same service-role client reaches both — no
cross-project keys.

- **Marketing code.** Each campaign has a `marketing_code` (a `campaign_ref`).
  The Director picks it from a dropdown populated by `sprint-codes`, which reads
  the marketing app's master view `public.vw_campaign_codes_master`. This is the
  same code other apps use (e.g. the Pipeline Tracker's `pipeline_campaign_codes`).
- **ROI.** `sprint-roi` computes the campaign's GP (return) and bonus pot
  (investment) and upserts one `public.promotions` row, keyed idempotently by
  `(source='toilet-roll-sprint', source_external_id=<slug>)`, setting
  `actual_gp`, `spend_actual`, `campaign_ref` and `marketing_app_url`
  (the `/sprint?campaign=<slug>` deep-link). ROI then appears in the marketing
  app like any other campaign.

**Safety:** ROI writes are **off by default**. Until `MARKETING_ROI_ENABLED=true`,
`sprint-roi` is a dry run that returns the figures it *would* write without
touching the marketing tables. Before switching it on, confirm the marketing
app's expected ingest for external promotions (the `promotions` table carries
`merged_from_manual` / `merge_log` / `lifecycle_state` merge logic).

**Setup additions for this integration:** point `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` at WG Main, set `SPRINT_BASE_URL`, expose the
`toilet_roll` schema (Settings → API → Exposed schemas), and flip
`MARKETING_ROI_ENABLED` only when ready.

> **Security note (WG Main):** the Supabase advisor reports Row Level Security is
> **disabled on 44 public tables** on WG Main (incl. `wg_marketing_codes`,
> `promotions`, `wg_pipeline_mirror`, `commission_data`, `wg_settings`) and 4 on
> the Pipeline project — they're reachable with the anon key. The Sprint avoids
> this for its own data (the `toilet_roll` tables have RLS on with no anon
> policy), but the marketing tables are a pre-existing exposure worth addressing.
> Enabling RLS there needs policies added at the same time or it will break the
> existing apps, so it should be planned deliberately — not switched on blind.

## Open questions (from the brief)

1. Which Sage product, and can they provide API credentials? (Live sync is a
   stretch goal; the backend service for it is described in the brief, Section 8.)
2. Real promotion start/end dates? (Currently placeholder values in `settings`.)
3. Individual salesperson logins or shared team access? (Currently the
   salesperson views are open; only Director is gated.)
4. Confirm value-weighted average margin is acceptable. (Implemented as such.)
