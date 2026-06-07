// POST /api/sprint-import  { csv: "<raw csv text>" }
//
// Ports the prototype's Sage CSV import. Auto-detects columns by header
// keyword, matches salespeople by name, inserts matching rows and reports any
// that were skipped so nothing fails silently.

import type { Handler } from "@netlify/functions";
import {
  getSalespeople,
  insertSale,
  matchSalesperson,
  type NewSale,
} from "./_shared/db";
import { badRequest, methodNotAllowed, ok, parseBody, serverError } from "./_shared/http";

const COLUMN_KEYWORDS: Record<string, string[]> = {
  date: ["date"],
  salesperson: ["salesperson", "sales person", "rep", "representative", "agent"],
  customer: ["customer", "account", "client"],
  cases: ["cases", "case", "qty", "quantity", "units"],
  price: ["price", "rate", "net", "unit price", "selling"],
};

/** Minimal CSV parser handling quoted fields and escaped quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

function detectColumns(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((raw, idx) => {
    const h = raw.trim().toLowerCase();
    for (const [key, keywords] of Object.entries(COLUMN_KEYWORDS)) {
      if (map[key] === undefined && keywords.some((k) => h.includes(k))) {
        map[key] = idx;
      }
    }
  });
  return map;
}

/** Parse a number from a cell, tolerating £, commas and surrounding spaces. */
function num(cell: string | undefined): number {
  if (cell == null) return NaN;
  return Number(cell.replace(/[£$,\s]/g, ""));
}

interface ImportBody {
  csv?: string;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  try {
    const body = parseBody<ImportBody>(event.body);
    const text = (body.csv ?? "").trim();
    if (!text) return badRequest("No CSV content was provided.");

    const rows = parseCsv(text);
    if (rows.length < 2) return badRequest("The CSV has no data rows.");

    const cols = detectColumns(rows[0]);
    const missing = ["salesperson", "cases", "price"].filter((k) => cols[k] === undefined);
    if (missing.length) {
      return badRequest(
        `Could not find column(s) for: ${missing.join(", ")}. ` +
          "Expected headers containing keywords like salesperson/rep, cases/qty and price/rate/net.",
      );
    }

    const people = await getSalespeople();
    const toInsert: NewSale[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const repName = r[cols.salesperson]?.trim() ?? "";
      const person = matchSalesperson(people, repName);
      if (!person) {
        skipped.push({ row: i + 1, reason: `No salesperson match for "${repName || "(blank)"}"` });
        continue;
      }
      const cases = num(r[cols.cases]);
      const pricePerCase = num(r[cols.price]);
      if (!Number.isFinite(cases) || cases <= 0) {
        skipped.push({ row: i + 1, reason: `Invalid cases value "${r[cols.cases] ?? ""}"` });
        continue;
      }
      if (!Number.isFinite(pricePerCase) || pricePerCase <= 0) {
        skipped.push({ row: i + 1, reason: `Invalid price value "${r[cols.price] ?? ""}"` });
        continue;
      }
      const rawDate = cols.date !== undefined ? r[cols.date]?.trim() : "";
      toInsert.push({
        saleDate: normaliseDate(rawDate),
        salespersonId: person.id,
        customer: cols.customer !== undefined ? r[cols.customer]?.trim() || null : null,
        cases,
        pricePerCase,
        source: "csv",
      });
    }

    let added = 0;
    for (const sale of toInsert) {
      await insertSale(sale);
      added++;
    }

    return ok({ added, skipped, total: rows.length - 1 });
  } catch (err) {
    return serverError(err);
  }
};

/** Best-effort date normalisation to YYYY-MM-DD; falls back to today. */
function normaliseDate(raw: string | undefined): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!raw) return today;
  // Already ISO.
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY (Sage UK default).
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(raw.trim());
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? today : parsed.toISOString().slice(0, 10);
}
