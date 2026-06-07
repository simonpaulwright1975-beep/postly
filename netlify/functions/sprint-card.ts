// /api/sprint-card?campaign=<slug>[&format=html]
//
// A PUBLIC, sanitized "promotional card" for the Daily Run Rate 6pm email.
// It deliberately carries ONLY the league table and how much each rep has sold
// (cases + sales value) plus the team's points progress. Every earnings figure
// — commission, individual/team bonus, gross profit and margin — is stripped,
// so it is safe to send to all staff.
//
//   format=json (default) → data for the Run Rate app to render itself
//   format=html           → a ready-to-embed, email-safe card (inline styles)

import type { Handler } from "@netlify/functions";
import { buildStandings } from "./_shared/calc";
import { campaignConfig, getSales, getSalespeople, resolveCampaign } from "./_shared/db";
import { methodNotAllowed, serverError } from "./_shared/http";

const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" };

const gbp0 = (n: number) =>
  "£" + Math.round(n).toLocaleString("en-GB");
const intf = (n: number) => Math.round(n).toLocaleString("en-GB");

function dateRange(start: string | null, end: string | null): string {
  const f = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase();
  if (start && end) return `${f(start).replace(/ \d{4}$/, "")} – ${f(end)}`;
  return start ? f(start) : end ? f(end) : "";
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return methodNotAllowed();
    const campaign = await resolveCampaign(event.queryStringParameters?.campaign);
    const config = campaignConfig(campaign);
    const [people, sales] = await Promise.all([getSalespeople(campaign.id), getSales(campaign.id)]);
    const standings = buildStandings(people, sales, config);

    // Sanitized payload — sold figures only, no earnings/margin.
    const table = standings.table.map((r) => ({
      rank: r.position,
      name: r.name,
      role: r.role,
      points: r.totalPoints,
      casesSold: r.totalCases,
      salesValue: r.totalSalesValue,
    }));
    const payload = {
      campaign: {
        name: campaign.name,
        slug: campaign.slug,
        status: campaign.status,
        productName: campaign.product_name,
        promoStart: campaign.promo_start,
        promoEnd: campaign.promo_end,
      },
      updatedAt: new Date().toISOString(),
      table,
      totals: {
        casesSold: standings.dashboard.totalCases,
        salesValue: standings.dashboard.totalSalesValue,
        topSalesperson: standings.dashboard.topSalesperson,
      },
      team: {
        points: standings.team.teamPoints,
        target: standings.team.target,
        remaining: standings.team.remaining,
        unlocked: standings.team.unlocked,
      },
    };

    if (event.queryStringParameters?.format === "html") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", ...CORS },
        body: renderCardHtml(payload),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
      body: JSON.stringify(payload),
    };
  } catch (err) {
    return serverError(err);
  }
};

type CardPayload = {
  campaign: { name: string; slug: string; status: string; productName: string; promoStart: string | null; promoEnd: string | null };
  table: Array<{ rank: number; name: string; role: string; points: number; casesSold: number; salesValue: number }>;
  totals: { casesSold: number; salesValue: number; topSalesperson: string | null };
  team: { points: number; target: number; remaining: number; unlocked: boolean };
};

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Email-safe HTML: table layout, inline styles, web-safe font fallback.
function renderCardHtml(p: CardPayload): string {
  const dates = dateRange(p.campaign.promoStart, p.campaign.promoEnd);
  const rows = p.table
    .map((r) => {
      const lead = r.rank === 1;
      return `
      <tr>
        <td style="padding:10px 0;border-top:1px solid #d8cfc1;width:34px;vertical-align:middle">
          <div style="width:30px;height:30px;border-radius:50%;background:${lead ? "#c2693f" : "#1c1a17"};color:#ffffff;font:900 14px Arial,Helvetica,sans-serif;text-align:center;line-height:30px">${r.rank}</div>
        </td>
        <td style="padding:10px 12px;border-top:1px solid #d8cfc1;vertical-align:middle">
          <div style="font:800 16px Arial,Helvetica,sans-serif;color:#1c1a17">${esc(r.name)}</div>
          <div style="font:700 10px Arial,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#8c857a">${esc(r.role)}</div>
        </td>
        <td style="padding:10px 0;border-top:1px solid #d8cfc1;text-align:right;vertical-align:middle">
          <div style="font:900 20px Arial,Helvetica,sans-serif;color:#c2693f;letter-spacing:-.02em">${intf(r.points)} pts</div>
          <div style="font:600 12px Arial,Helvetica,sans-serif;color:#8c857a">${intf(r.casesSold)} cases · ${gbp0(r.salesValue)} sold</div>
        </td>
      </tr>`;
    })
    .join("");

  const teamLine = p.team.unlocked
    ? `Team target smashed — ${intf(p.team.points)} pts`
    : `Team challenge: ${intf(p.team.points)} / ${intf(p.team.target)} pts · ${intf(p.team.remaining)} to go`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#f1ebe1;border-radius:14px;border-collapse:separate">
  <tr><td style="padding:22px 24px">
    <div style="width:40px;height:6px;background:#c2693f;border-radius:4px"></div>
    <div style="font:700 11px Arial,Helvetica,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8c857a;margin-top:14px">${esc(p.campaign.name)}${dates ? " / " + dates : ""}</div>
    <div style="font:900 24px Arial,Helvetica,sans-serif;color:#1c1a17;text-transform:uppercase;letter-spacing:-.02em;margin-top:4px">Sprint League</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px;border-collapse:collapse">${rows}
    </table>
    <div style="height:2px;background:#c2693f;margin:18px 0 12px"></div>
    <div style="font:700 13px Arial,Helvetica,sans-serif;color:#1c1a17">${teamLine}</div>
    <div style="font:600 12px Arial,Helvetica,sans-serif;color:#8c857a;margin-top:2px">${intf(p.totals.casesSold)} cases · ${gbp0(p.totals.salesValue)} sold so far. Full league at the Toilet Roll Sprint.</div>
  </td></tr>
</table>`;
}
