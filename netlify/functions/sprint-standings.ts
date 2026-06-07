// GET /api/sprint-standings
// Public: league table + dashboard strip + team challenge. Recomputed
// server-side from stored sales so every device stays in sync. Contains no
// director-only business figures (those live behind sprint-director auth).

import type { Handler } from "@netlify/functions";
import { buildStandings } from "./_shared/calc";
import { getSales, getSalespeople, getSettings } from "./_shared/db";
import { methodNotAllowed, ok, serverError } from "./_shared/http";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();
  try {
    const [people, sales, settings] = await Promise.all([
      getSalespeople(),
      getSales(),
      getSettings(),
    ]);
    const standings = buildStandings(people, sales, settings.costPerCase);
    return ok({
      ...standings,
      meta: {
        costPerCase: settings.costPerCase,
        promoStart: settings.promoStart,
        promoEnd: settings.promoEnd,
      },
    });
  } catch (err) {
    return serverError(err);
  }
};
