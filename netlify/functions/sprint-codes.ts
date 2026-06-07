// GET /api/sprint-codes — active marketing codes from the marketing app's master
// view (public.vw_campaign_codes_master), for the Director's code picker.
// Director-gated: the codes belong to the marketing app, not the public league.

import type { Handler } from "@netlify/functions";
import { bearer, verifyToken } from "./_shared/auth";
import { listMarketingCodes } from "./_shared/db";
import { methodNotAllowed, ok, serverError, unauthorized } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();
  if (!verifyToken(bearer(event.headers as Record<string, string | undefined>))) {
    return unauthorized("Director login required.");
  }
  try {
    return ok({ codes: await listMarketingCodes() });
  } catch (err) {
    return serverError(err);
  }
};
