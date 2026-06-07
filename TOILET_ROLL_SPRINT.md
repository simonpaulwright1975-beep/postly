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

| Piece | Path |
| --- | --- |
| Frontend (single self-contained page) | `public/toilet-roll-sprint.html` |
| Calculation engine (source of truth) | `netlify/functions/_shared/calc.ts` |
| DB access (service-role, schema-scoped) | `netlify/functions/_shared/db.ts` |
| Director auth (server-side PIN + token) | `netlify/functions/_shared/auth.ts` |
| API: league + dashboard | `netlify/functions/sprint-standings.ts` |
| API: sales CRUD | `netlify/functions/sprint-sales.ts` |
| API: CSV import | `netlify/functions/sprint-import.ts` |
| API: director login + figures | `netlify/functions/sprint-director.ts` |
| Database schema + seed | `supabase/migrations/0004_toilet_roll_sprint.sql` |

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

1. **Database.** Apply `supabase/migrations/0004_toilet_roll_sprint.sql` to the
   Supabase project this app should use. (Not auto-applied — this repo is linked
   to more than one Supabase project, so pick the right one deliberately.) It
   creates the isolated `toilet_roll` schema, tables, seed salespeople and
   settings, and exposes the schema to PostgREST.
2. **Environment variables** (Netlify → site settings, or `.env` for
   `netlify dev`):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
   - `DIRECTOR_PIN` (optional; defaults to the brief's PIN)
   - `DIRECTOR_TOKEN_SECRET` (set a long random value in production)
3. **Run locally:** `npm run dev:netlify` then open
   `http://localhost:8888/toilet-roll-sprint.html` (or `/sprint`).
4. **Deploy:** `npm run build` (Netlify runs this). The page is served at
   `/toilet-roll-sprint.html` and `/sprint`.

## Configurable for future promotions

Without code changes (DB/env only):

- **Cost base** — `toilet_roll.settings.cost_per_case` (seeded `3.66`).
- **Promotion dates** — `settings.promo_start` / `promo_end`.
- **Salespeople** — rows in `toilet_roll.salespeople`.
- **Director PIN** — `DIRECTOR_PIN` env var.

Business logic that currently lives in code (`_shared/calc.ts`) and would be
promoted to config to make this a true multi-product template: the margin
multiplier bands, the bonus ladder, the team target/bonus, and the product
name/branding. See **"Reusing as a template"** below.

## Reusing as a template (multi-product / multi-campaign)

The app is already structured so a second promotion does **not** need a new
project or repo. Two viable approaches:

- **Recommended — one deployment, many campaigns (config-driven).** Add a
  `campaigns` table holding each campaign's name, product, cost base, dates,
  salespeople, points tiers, bonus ladder and team target. Sales carry a
  `campaign_id`; the page is opened as `/sprint?campaign=<slug>`; the functions
  filter and compute per campaign. One Netlify site, one schema, many campaigns —
  each with a stable deep-link a WGHUB card can point at. The current
  single-campaign tables are a straightforward migration to this shape.
- **Per-campaign site.** Duplicate the schema + functions under a new prefix and
  deploy a separate Netlify site. More isolation, more to maintain.

Because everything is namespaced to the `toilet_roll` schema and `sprint-*`
functions, adding either of these will not affect the other apps in this repo.

## Open questions (from the brief)

1. Which Sage product, and can they provide API credentials? (Live sync is a
   stretch goal; the backend service for it is described in the brief, Section 8.)
2. Real promotion start/end dates? (Currently placeholder values in `settings`.)
3. Individual salesperson logins or shared team access? (Currently the
   salesperson views are open; only Director is gated.)
4. Confirm value-weighted average margin is acceptable. (Implemented as such.)
