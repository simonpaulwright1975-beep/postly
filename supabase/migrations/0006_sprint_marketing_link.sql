-- Marketing-app integration for the Sprint (WG Main estate).
--
-- Each campaign can carry a marketing code (campaign_ref) chosen from the
-- marketing app's master list (public.vw_campaign_codes_master). The Sprint
-- backend reads that view and writes a public.promotions row to register ROI
-- (actual_gp = GP earned, spend_actual = bonus pot) — both via the service-role
-- client, in the same database, so no cross-project keys are needed.

alter table toilet_roll.campaigns
  add column if not exists marketing_code text;

comment on column toilet_roll.campaigns.marketing_code is
  'campaign_ref from public.wg_marketing_codes / vw_campaign_codes_master. Links the sprint to the marketing app for attribution + ROI.';

-- No extra grants required: on WG Main the service_role already owns public,
-- so the Sprint functions can read vw_campaign_codes_master and upsert
-- public.promotions directly. Nothing in the public schema is modified here.
