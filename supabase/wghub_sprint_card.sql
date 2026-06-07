-- WGHUB card for the Toilet Roll Sprint — ADDED BUT INACTIVE.
--
-- Nothing here makes the card visible. Both options stage the card switched off;
-- you "introduce" it later with the one-line change noted under each.
--
-- Replace the placeholder URL once the Sprint app is deployed. The clean
-- card target is the campaign deep-link, e.g.
--   https://<your-sprint-site>.netlify.app/sprint?campaign=toilet-roll
-- (or /sprint for the landing page listing all live sprints).

-- ===========================================================================
-- OPTION A — WGHUB grid (hub_admin_config). Data holds URL + order + visibility;
-- the card's label/icon must exist in the WGHUB front-end for the key 'trsprint'.
-- This stages ONLY the URL, so the card is invisible to everyone until you add
-- 'trsprint' to cardOrder and to the relevant people in cardVisibility.
-- ===========================================================================
update public.hub_admin_config
set config = jsonb_set(
      config,
      '{urls,trsprint}',
      '"https://REPLACE-with-sprint-url/sprint?campaign=toilet-roll"'::jsonb,
      true
    ),
    updated_at = now()
where id = 'global';

-- To INTRODUCE it later (example — make it visible to the sales team + director):
--   1. Append 'trsprint' to config->'cardOrder'.
--   2. Add 'trsprint' to each chosen email's array in config->'cardVisibility'.
--   3. Add a card definition (label/icon) for 'trsprint' in the WGHUB front-end.

-- ===========================================================================
-- OPTION B — data-driven app card (progress_external_apps). No front-end change
-- needed: label/colour/description live in the row. active=false keeps it hidden.
-- ===========================================================================
insert into public.progress_external_apps
  (key, label, short_code, url, color, description, sort_order, active)
values
  ('trsprint',
   'Toilet Roll Sprint',
   'TS',
   'https://REPLACE-with-sprint-url/sprint?campaign=toilet-roll',
   '#C2693F',
   '4-week sales sprint: live league table, earning potential and director self-funding figures.',
   60,
   false)
on conflict (key) do nothing;

-- To INTRODUCE it later:
--   update public.progress_external_apps set active = true where key = 'trsprint';
