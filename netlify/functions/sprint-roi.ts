// POST /api/sprint-roi?campaign=<slug> — register the sprint's ROI in the
// marketing app by upserting a public.promotions row (actual_gp = GP earned,
// spend_actual = bonus pot). Director-gated.
//
// Safe by default: unless MARKETING_ROI_ENABLED=true this is a dry run that
// returns the figures it *would* write, so the integration can be reviewed
// before it ever touches the marketing tables.

import type { Handler } from "@netlify/functions";
import { buildDirectorFigures } from "./_shared/calc";
import { bearer, verifyToken } from "./_shared/auth";
import {
  campaignConfig,
  campaignPublic,
  getSales,
  getSalespeople,
  resolveCampaign,
  upsertPromotionRoi,
} from "./_shared/db";
import { badRequest, methodNotAllowed, ok, serverError, unauthorized } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  if (!verifyToken(bearer(event.headers as Record<string, string | undefined>))) {
    return unauthorized("Director login required.");
  }
  try {
    const campaign = await resolveCampaign(event.queryStringParameters?.campaign);
    const pub = campaignPublic(campaign);
    if (!pub.marketingCode) {
      return badRequest("Set a marketing code on this sprint before registering ROI.");
    }

    const [people, sales] = await Promise.all([
      getSalespeople(campaign.id),
      getSales(campaign.id),
    ]);
    const figures = buildDirectorFigures(people, sales, campaignConfig(campaign));

    const base = process.env.SPRINT_BASE_URL?.replace(/\/$/, "") ?? "";
    const result = await upsertPromotionRoi({
      slug: pub.slug,
      name: pub.name,
      marketingCode: pub.marketingCode,
      startDate: pub.promoStart,
      endDate: pub.promoEnd,
      actualGp: figures.totalGrossProfit,
      spendActual: figures.totalBonusLiability,
      marketingAppUrl: `${base}/sprint?campaign=${encodeURIComponent(pub.slug)}`,
      status: pub.status === "archived" ? "closed" : "live",
    });

    return ok({
      roi: result,
      enabled: process.env.MARKETING_ROI_ENABLED === "true",
    });
  } catch (err) {
    return serverError(err);
  }
};
