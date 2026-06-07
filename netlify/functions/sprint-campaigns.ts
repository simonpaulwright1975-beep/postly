// GET /api/sprint-campaigns                 → active campaigns (landing page)
// GET /api/sprint-campaigns?campaign=<slug>  → one campaign's public config

import type { Handler } from "@netlify/functions";
import { campaignPublic, getCampaignBySlug, listCampaigns } from "./_shared/db";
import { json, methodNotAllowed, ok, serverError } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();
  try {
    const slug = event.queryStringParameters?.campaign;
    if (slug) {
      const row = await getCampaignBySlug(slug);
      if (!row) return json(404, { error: `No campaign found for "${slug}".` });
      return ok({ campaign: campaignPublic(row) });
    }
    const includeAll = event.queryStringParameters?.all === "1";
    return ok({ campaigns: await listCampaigns(includeAll) });
  } catch (err) {
    return serverError(err);
  }
};
