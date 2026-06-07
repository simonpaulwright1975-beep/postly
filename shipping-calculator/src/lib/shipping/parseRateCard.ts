// Parser for the monthly Kerry Logistics rate-card workbook.
//
// The card is an Excel file with a fixed layout. Rather than hard-code cell
// addresses (which shift if a row is inserted), we anchor on the section
// heading labels and read the data rows relative to them, with sensible
// fallbacks. Returns a structured card plus any warnings worth surfacing so the
// user can eyeball the parsed numbers before saving.

import * as XLSX from "xlsx";
import type { NewRateCard } from "./types";

type Cell = string | number | boolean | null | undefined;
type Grid = Cell[][];

const HUANGPU_CFS_TRANSFER_USD = 50;

function text(c: Cell): string {
  return c == null ? "" : String(c).trim();
}

function num(c: Cell): number {
  if (typeof c === "number") return c;
  if (c == null) return 0;
  const n = parseFloat(String(c).replace(/[£$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cell(grid: Grid, r: number, col: number): Cell {
  return grid[r]?.[col];
}

/** First row index whose cell in `col` matches the predicate. */
function findRow(grid: Grid, col: number, pred: (s: string) => boolean, from = 0): number {
  for (let r = from; r < grid.length; r++) {
    if (pred(text(cell(grid, r, col)))) return r;
  }
  return -1;
}

/** Find a cell anywhere matching the predicate; returns [row, col] or [-1,-1]. */
function findCell(grid: Grid, pred: (s: string) => boolean, from = 0): [number, number] {
  for (let r = from; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (pred(text(row[c]))) return [r, c];
    }
  }
  return [-1, -1];
}

/** First numeric value scanning downward from (r+1) in a column. */
function firstNumberBelow(grid: Grid, r: number, col: number): number | null {
  for (let i = r + 1; i < grid.length; i++) {
    const v = cell(grid, i, col);
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(parseFloat(v))) return parseFloat(v);
  }
  return null;
}

function toIso(d: string, m: string, y: string): string | null {
  const day = Math.min(31, parseInt(d, 10));
  const month = parseInt(m, 10);
  const year = parseInt(y, 10);
  if (!day || !month || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface ParseResult {
  card: NewRateCard;
  warnings: string[];
}

/** Parse a 2-D grid of cell values (already read from the worksheet). */
export function parseRateCardGrid(grid: Grid, title: string): ParseResult {
  const warnings: string[] = [];
  const lc = (s: string) => s.toLowerCase();

  // ---- Validity dates ----
  let validFrom: string | null = null;
  let validTo: string | null = null;
  const [vr] = findCell(grid, (s) => lc(s).includes("valid from"));
  if (vr >= 0) {
    const row = (grid[vr] ?? []).map(text).join(" ");
    const matches = [...row.matchAll(/(\d{1,3})\/(\d{1,2})\/(\d{4})/g)];
    if (matches[0]) validFrom = toIso(matches[0][1], matches[0][2], matches[0][3]);
    if (matches[1]) validTo = toIso(matches[1][1], matches[1][2], matches[1][3]);
  }

  // ---- Ocean freight lanes ----
  const oceanHeader = findRow(grid, 0, (s) => lc(s) === "port");
  const oceanLanes: NewRateCard["oceanLanes"] = [];
  if (oceanHeader >= 0) {
    for (let r = oceanHeader + 1; r < grid.length; r++) {
      const origin = text(cell(grid, r, 0));
      if (!origin || origin.startsWith("*")) break;
      // Stop if we've run into the next section heading.
      if (lc(origin).includes("inland") || lc(origin).includes("rates")) break;
      const isHuangpu = lc(origin).includes("huangpu");
      oceanLanes.push({
        id: crypto.randomUUID(),
        origin,
        pod: text(cell(grid, r, 1)),
        transitDays: typeof cell(grid, r, 2) === "number" ? (cell(grid, r, 2) as number) : num(cell(grid, r, 2)) || null,
        freightNet20: num(cell(grid, r, 3)),
        freightNet40: num(cell(grid, r, 4)),
        freightNet40hq: num(cell(grid, r, 5)),
        surcharges: {
          pss: num(cell(grid, r, 6)),
          ets: num(cell(grid, r, 7)),
          ebaf: num(cell(grid, r, 8)),
          caf: num(cell(grid, r, 9)),
        },
        lclPerCbm: num(cell(grid, r, 13)),
        cfsTransferUsd: isHuangpu ? HUANGPU_CFS_TRANSFER_USD : 0,
      });
    }
  }
  if (!oceanLanes.length) warnings.push("Couldn't find any ocean freight lanes — check the “Port” table.");

  // ---- UK FCL inland (per container) ----
  const fclInland: NewRateCard["fclInland"] = [];
  const fclTitle = findRow(grid, 0, (s) => lc(s).includes("fcl inland"));
  const fclHeader = fclTitle >= 0 ? findRow(grid, 0, (s) => lc(s) === "destination", fclTitle) : -1;
  if (fclHeader >= 0) {
    const r = fclHeader + 1;
    fclInland.push({
      destination: text(cell(grid, r, 0)),
      pod: text(cell(grid, r, 1)),
      carrier: text(cell(grid, r, 2)),
      shunt: { c20: num(cell(grid, r, 3)), c40: num(cell(grid, r, 4)), c40hq: num(cell(grid, r, 5)) },
      devan: { c20: num(cell(grid, r, 6)), c40: num(cell(grid, r, 7)), c40hq: num(cell(grid, r, 8)) },
      sortPerCarton: num(cell(grid, r, 9)),
      importServiceFee: num(cell(grid, r, 10)),
      customsClearance: num(cell(grid, r, 12)),
      docs: num(cell(grid, r, 14)),
    });
  } else {
    warnings.push("Couldn't find the UK FCL inland rates section.");
  }

  // ---- UK LCL inland (per shipment) ----
  const lclInland: NewRateCard["lclInland"] = [];
  const lclTitle = findRow(grid, 0, (s) => lc(s).includes("lcl inland"));
  const lclHeader = lclTitle >= 0 ? findRow(grid, 0, (s) => lc(s) === "destination", lclTitle) : -1;
  let lclDataRow = -1;
  if (lclHeader >= 0) {
    lclDataRow = lclHeader + 1;
    const r = lclDataRow;
    lclInland.push({
      destination: text(cell(grid, r, 0)),
      pod: text(cell(grid, r, 1)),
      carrier: text(cell(grid, r, 2)),
      thcPer2cbm: num(cell(grid, r, 3)),
      customsClearance: num(cell(grid, r, 4)),
      docs: num(cell(grid, r, 6)),
      sortPerCarton: num(cell(grid, r, 7)),
    });
  } else {
    warnings.push("Couldn't find the UK LCL inland rates section.");
  }

  // ---- Variables: ROE + default CBM ----
  let roe = 0;
  let defaultCbm = 0;
  const [roeR, roeC] = findCell(grid, (s) => lc(s).includes("roe"));
  if (roeR >= 0) {
    roe = firstNumberBelow(grid, roeR, roeC) ?? 0;
    // The "CBM" variable sits in the column to the right of ROE.
    defaultCbm = firstNumberBelow(grid, roeR - 2 >= 0 ? roeR - 2 : roeR, roeC + 1) ?? 0;
  }
  if (!roe && lclDataRow >= 0) roe = num(cell(grid, lclDataRow, 16));
  if (!defaultCbm && lclDataRow >= 0) defaultCbm = num(cell(grid, lclDataRow, 17));
  if (!roe) {
    roe = 1.3;
    warnings.push("Couldn't read the ROE (GBP→USD) — defaulted to 1.3, please confirm.");
  }
  if (!defaultCbm) defaultCbm = 5;

  // ---- Delivery tariff ----
  let delivery: NewRateCard["delivery"] = null;
  const [delR, delC] = findCell(grid, (s) => /delivery to /i.test(s));
  if (delR >= 0) {
    const destMatch = text(cell(grid, delR, delC)).match(/delivery to\s+(.+)/i);
    const destination = destMatch ? destMatch[1].trim() : "delivery";
    const priceCol = delC;
    const [fr, fc] = findCell(grid, (s) => lc(s) === "from", delR);
    const bandList: { fromCbm: number; toCbm: number; price: number }[] = [];
    if (fr >= 0) {
      for (let r = fr + 1; r < grid.length; r++) {
        const f = cell(grid, r, fc);
        const t = cell(grid, r, fc + 1);
        const p = cell(grid, r, priceCol);
        const fStr = text(f);
        if (fStr.startsWith("*") || (f == null && t == null)) break;
        if (typeof f === "number" || (fStr && Number.isFinite(parseFloat(fStr)))) {
          bandList.push({ fromCbm: num(f), toCbm: num(t), price: num(p) });
        }
      }
    }
    // Tri-axle surcharge note.
    let triAxlePct = 10;
    let triAxleKg = 21000;
    const noteRow = (grid.map((row) => row.map(text).join(" ")) ?? []).join("\n");
    const pctM = noteRow.match(/tri-?axle surcharge of\s*(\d+)%/i);
    if (pctM) triAxlePct = parseInt(pctM[1], 10);
    const kgM = noteRow.match(/greater th\w+\s*([\d,]+)\s*kgs/i);
    if (kgM) triAxleKg = parseInt(kgM[1].replace(/,/g, ""), 10);
    if (bandList.length) {
      delivery = {
        destination,
        bands: bandList,
        triAxleSurchargePct: triAxlePct,
        triAxleOverKg: triAxleKg,
      };
    }
  }
  if (!delivery) warnings.push("Couldn't find a delivery tariff table (optional).");

  // ---- Notes (lines beginning with *) ----
  const notes: string[] = [];
  for (const row of grid) {
    const a = text(row?.[0]);
    if (a.startsWith("*")) notes.push(a.replace(/^\*\s*/, "").trim());
  }

  // ---- Carrier ----
  const carrier =
    lc(fclInland[0]?.carrier ?? lclInland[0]?.carrier ?? "").includes("kerry")
      ? "Kerry Logistics"
      : fclInland[0]?.carrier || lclInland[0]?.carrier || "Kerry Logistics";

  const card: NewRateCard = {
    carrier,
    title,
    validFrom,
    validTo,
    freightCurrency: "USD",
    inlandCurrency: "GBP",
    oceanLanes,
    fclInland,
    lclInland,
    delivery,
    variables: { roe, defaultCbm },
    notes,
    source: "kerry-xlsx",
    active: false,
  };

  return { card, warnings };
}

/** Read an uploaded .xlsx file (ArrayBuffer) into a structured rate card. */
export function parseRateCardWorkbook(buf: ArrayBuffer, title: string): ParseResult {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null }) as Grid;
  return parseRateCardGrid(grid, title);
}
