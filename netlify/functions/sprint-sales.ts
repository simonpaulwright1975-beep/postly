// /api/sprint-sales?campaign=<slug>
//   GET            → recent sale entries (with salesperson names)
//   POST {sale}    → add a manual sale
//   DELETE ?id=…   → remove a sale entry

import type { Handler } from "@netlify/functions";
import { computeSale } from "./_shared/calc";
import {
  campaignConfig,
  deleteSale,
  getRecentSales,
  getSalespeople,
  insertSale,
  resolveCampaign,
} from "./_shared/db";
import { badRequest, methodNotAllowed, ok, parseBody, serverError } from "./_shared/http";

interface SaleBody {
  salespersonId?: string;
  saleDate?: string;
  customer?: string;
  cases?: number | string;
  pricePerCase?: number | string;
}

export const handler: Handler = async (event) => {
  try {
    const slug = event.queryStringParameters?.campaign;

    if (event.httpMethod === "GET") {
      const campaign = await resolveCampaign(slug);
      return ok({ sales: await getRecentSales(campaign.id, 100) });
    }

    if (event.httpMethod === "POST") {
      const campaign = await resolveCampaign(slug);
      const body = parseBody<SaleBody>(event.body);
      const cases = Number(body.cases);
      const pricePerCase = Number(body.pricePerCase);
      const saleDate = (body.saleDate ?? "").trim();
      const salespersonId = (body.salespersonId ?? "").trim();

      if (!salespersonId) return badRequest("A salesperson is required.");
      if (!saleDate) return badRequest("A sale date is required.");
      if (!Number.isFinite(cases) || cases <= 0)
        return badRequest("Cases sold must be a positive number.");
      if (!Number.isFinite(pricePerCase) || pricePerCase <= 0)
        return badRequest("Selling price per case must be a positive number.");

      const people = await getSalespeople(campaign.id);
      if (!people.some((p) => p.id === salespersonId))
        return badRequest("Unknown salesperson for this campaign.");

      const id = await insertSale({
        campaignId: campaign.id,
        saleDate,
        salespersonId,
        customer: (body.customer ?? "").trim() || null,
        cases,
        pricePerCase,
        source: "manual",
      });
      return ok({ id, preview: computeSale({ cases, pricePerCase }, campaignConfig(campaign)) });
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;
      if (!id) return badRequest("A sale id is required.");
      const campaign = await resolveCampaign(slug);
      await deleteSale(campaign.id, id);
      return ok({ deleted: id });
    }

    return methodNotAllowed();
  } catch (err) {
    return serverError(err);
  }
};
