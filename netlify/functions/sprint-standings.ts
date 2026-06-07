// GET /api/sprint-standings?campaign=<slug>
// Public: league table + dashboard strip + team challenge for one campaign,
// plus that campaign's public config/branding so the page can render in one
// round-trip. Recomputed server-side from stored sales. No director-only figures.

import type { Handler } from "@netlify/functions";
import { buildStandings } from "./_shared/calc";
import {
  campaignConfig,
  campaignPublic,
  getSales,
  getSalespeople,
  resolveCampaign,
} from "./_shared/db";
import { methodNotAllowed, ok, serverError } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();
  try {
    const campaign = await resolveCampaign(event.queryStringParameters?.campaign);
    const [people, sales] = await Promise.all([
      getSalespeople(campaign.id),
      getSales(campaign.id),
    ]);
    const standings = buildStandings(people, sales, campaignConfig(campaign));
    return ok({ ...standings, campaign: campaignPublic(campaign) });
  } catch (err) {
    return serverError(err);
  }
};
