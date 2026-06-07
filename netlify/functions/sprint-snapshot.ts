// /api/sprint-snapshot?campaign=<slug>
//   GET  → list locked result snapshots (public: standings only; director gets
//          the frozen business figures too)
//   POST → (director) freeze the current league, dashboard, team challenge and
//          director figures as an immutable snapshot for the sales team
//
// Standings are normally recomputed live from sales; a snapshot is the official,
// locked result that never changes again — even if data or config is later edited.

import type { Handler } from "@netlify/functions";
import { buildDirectorFigures, buildStandings } from "./_shared/calc";
import { bearer, verifyToken } from "./_shared/auth";
import {
  campaignConfig,
  getSales,
  getSalespeople,
  insertSnapshot,
  listSnapshots,
  resolveCampaign,
} from "./_shared/db";
import { methodNotAllowed, ok, parseBody, serverError, unauthorized } from "./_shared/http";

interface SnapshotBody {
  label?: string;
}

export const handler: Handler = async (event) => {
  try {
    const campaign = await resolveCampaign(event.queryStringParameters?.campaign);
    const isDirector = verifyToken(bearer(event.headers as Record<string, string | undefined>));

    if (event.httpMethod === "GET") {
      return ok({
        snapshots: await listSnapshots(campaign.id, isDirector),
        campaignStatus: campaign.status,
      });
    }

    if (event.httpMethod === "POST") {
      if (!isDirector) return unauthorized("Director login required.");
      const { label } = parseBody<SnapshotBody>(event.body);
      const config = campaignConfig(campaign);
      const [people, sales] = await Promise.all([
        getSalespeople(campaign.id),
        getSales(campaign.id),
      ]);
      const standings = buildStandings(people, sales, config);
      const director = buildDirectorFigures(people, sales, config);
      const saved = await insertSnapshot(
        campaign.id,
        (label ?? "").trim() || "Final results",
        null,
        standings,
        director,
        config,
      );
      return ok(saved);
    }

    return methodNotAllowed();
  } catch (err) {
    return serverError(err);
  }
};
