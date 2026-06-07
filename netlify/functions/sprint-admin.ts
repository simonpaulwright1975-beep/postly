// /api/sprint-admin  — director-only campaign + roster management.
//
// All actions require a valid director bearer token (same gate as the business
// figures). This is what lets you template a new promotion — change product,
// pricing, cost, dates, scoring — without starting a new project.
//
//   POST { action: "create-campaign", campaign: {...} }
//   POST { action: "update-campaign", id, patch: {...} }
//   POST { action: "add-salesperson", campaignId, name, role }
//   POST { action: "delete-salesperson", campaignId, id }

import type { Handler } from "@netlify/functions";
import {
  addSalesperson,
  deleteSalesperson,
  duplicateCampaign,
  getCampaignBySlug,
  getSalespeople,
  insertCampaign,
  updateCampaign,
  type NewCampaign,
} from "./_shared/db";
import { bearer, verifyToken } from "./_shared/auth";
import {
  badRequest,
  json,
  methodNotAllowed,
  ok,
  parseBody,
  serverError,
  unauthorized,
} from "./_shared/http";

interface AdminBody {
  action?: string;
  campaign?: NewCampaign;
  id?: string;
  campaignId?: string;
  name?: string;
  role?: string;
  patch?: Record<string, unknown>;
  // duplicate-campaign
  sourceId?: string;
  slug?: string;
  promoStart?: string | null;
  promoEnd?: string | null;
  copySalespeople?: boolean;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  if (!verifyToken(bearer(event.headers as Record<string, string | undefined>))) {
    return unauthorized("Director login required.");
  }

  try {
    const body = parseBody<AdminBody>(event.body);
    switch (body.action) {
      case "create-campaign": {
        const c = body.campaign;
        if (!c?.slug || !c?.name) return badRequest("A campaign slug and name are required.");
        if (!SLUG_RE.test(c.slug))
          return badRequest("Slug must be lowercase letters, numbers and hyphens (e.g. xmas-crackers).");
        if (await getCampaignBySlug(c.slug))
          return json(409, { error: `A campaign with slug "${c.slug}" already exists.` });
        if (!Number.isFinite(Number(c.costPerCase)))
          return badRequest("A numeric cost per case is required.");
        return ok({ campaign: await insertCampaign(c) });
      }

      case "update-campaign": {
        if (!body.id) return badRequest("A campaign id is required.");
        return ok({ campaign: await updateCampaign(body.id, body.patch ?? {}) });
      }

      case "duplicate-campaign": {
        if (!body.sourceId) return badRequest("A source campaign is required.");
        const name = (body.name ?? "").trim();
        const slug = (body.slug ?? "").trim();
        if (!name || !slug) return badRequest("A new name and slug are required.");
        if (!SLUG_RE.test(slug))
          return badRequest("Slug must be lowercase letters, numbers and hyphens (e.g. toilet-roll-2026-07).");
        if (await getCampaignBySlug(slug))
          return json(409, { error: `A campaign with slug "${slug}" already exists.` });
        return ok({
          campaign: await duplicateCampaign({
            sourceId: body.sourceId,
            name,
            slug,
            promoStart: body.promoStart ?? null,
            promoEnd: body.promoEnd ?? null,
            copySalespeople: body.copySalespeople !== false,
          }),
        });
      }

      case "add-salesperson": {
        if (!body.campaignId) return badRequest("A campaign id is required.");
        const name = (body.name ?? "").trim();
        const role = (body.role ?? "").trim();
        if (!name) return badRequest("A name is required.");
        const existing = await getSalespeople(body.campaignId);
        const person = await addSalesperson(body.campaignId, name, role, existing.length + 1);
        return ok({ salesperson: person });
      }

      case "delete-salesperson": {
        if (!body.campaignId || !body.id) return badRequest("A campaign id and salesperson id are required.");
        await deleteSalesperson(body.campaignId, body.id);
        return ok({ deleted: body.id });
      }

      default:
        return badRequest("Unknown action.");
    }
  } catch (err) {
    return serverError(err);
  }
};
