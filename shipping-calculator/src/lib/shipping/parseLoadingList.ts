// Parser for a factory loading / packing list. These vary wildly between
// suppliers, so rather than assume a fixed layout we sniff the header row for
// the columns we care about — cartons, CBM (volume) and gross weight — then sum
// the line items into the totals needed to price a shipment. The detected
// columns and totals are surfaced so the user can confirm or override.

import * as XLSX from "xlsx";

type Cell = string | number | boolean | null | undefined;
type Grid = Cell[][];

export interface LoadingListResult {
  totalCartons: number;
  totalCbm: number;
  totalWeightKg: number;
  lineItems: number;
  detected: { cartons: string | null; cbm: string | null; weight: string | null };
  warnings: string[];
}

function text(c: Cell): string {
  return c == null ? "" : String(c).trim();
}
function toNum(c: Cell): number {
  if (typeof c === "number") return c;
  const n = parseFloat(String(c ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

// Header keywords, most-specific first.
const CBM_KW = ["cbm", "m3", "m³", "volume", "measurement", "meas", "vol"];
const WEIGHT_KW = ["gross weight", "g.w", "gw", "gross", "weight", "kgs", "kg"];
const CARTON_KW = ["carton", "ctns", "ctn", "boxes", "packages", "pkgs", "pcs/ctn", "qty", "quantity"];

function matchCol(header: string[], keywords: string[]): number {
  const lower = header.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Pick the most likely header row: the one with the most keyword hits in its first dozen cells. */
function findHeaderRow(grid: Grid): number {
  const allKw = [...CBM_KW, ...WEIGHT_KW, ...CARTON_KW];
  let best = -1;
  let bestScore = 0;
  for (let r = 0; r < Math.min(grid.length, 25); r++) {
    const row = (grid[r] ?? []).map((c) => text(c).toLowerCase());
    const score = row.filter((h) => h && allKw.some((kw) => h.includes(kw))).length;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore >= 2 ? best : -1;
}

export function parseLoadingListGrid(grid: Grid): LoadingListResult {
  const warnings: string[] = [];
  const headerRow = findHeaderRow(grid);
  if (headerRow < 0) {
    return {
      totalCartons: 0,
      totalCbm: 0,
      totalWeightKg: 0,
      lineItems: 0,
      detected: { cartons: null, cbm: null, weight: null },
      warnings: ["Couldn't recognise the column headings — expected columns for cartons, CBM and weight."],
    };
  }

  const header = (grid[headerRow] ?? []).map(text);
  const cbmCol = matchCol(header, CBM_KW);
  const weightCol = matchCol(header, WEIGHT_KW);
  const cartonCol = matchCol(header, CARTON_KW);

  if (cbmCol < 0) warnings.push("No CBM / volume column found — total volume will be 0.");
  if (weightCol < 0) warnings.push("No gross weight column found — total weight will be 0.");
  if (cartonCol < 0) warnings.push("No cartons / quantity column found — total cartons will be 0.");

  let totalCbm = 0;
  let totalWeightKg = 0;
  let totalCartons = 0;
  let lineItems = 0;

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const firstText = text(row[0]).toLowerCase();
    // Skip explicit total / summary rows so we don't double-count.
    if (/\b(total|grand total|sub-?total)\b/.test((grid[r] ?? []).map(text).join(" ").toLowerCase())) continue;

    const cbm = cbmCol >= 0 ? toNum(row[cbmCol]) : NaN;
    const weight = weightCol >= 0 ? toNum(row[weightCol]) : NaN;
    const cartons = cartonCol >= 0 ? toNum(row[cartonCol]) : NaN;
    const hasData =
      (!Number.isNaN(cbm) && cbm > 0) ||
      (!Number.isNaN(weight) && weight > 0) ||
      (!Number.isNaN(cartons) && cartons > 0);
    if (!hasData) {
      // Blank row after data usually marks the end of the line items.
      if (!firstText && r > headerRow + 1) break;
      continue;
    }
    if (!Number.isNaN(cbm)) totalCbm += cbm;
    if (!Number.isNaN(weight)) totalWeightKg += weight;
    if (!Number.isNaN(cartons)) totalCartons += cartons;
    lineItems++;
  }

  return {
    totalCartons: Math.round(totalCartons),
    totalCbm: Math.round(totalCbm * 1000) / 1000,
    totalWeightKg: Math.round(totalWeightKg * 100) / 100,
    lineItems,
    detected: {
      cartons: cartonCol >= 0 ? header[cartonCol] : null,
      cbm: cbmCol >= 0 ? header[cbmCol] : null,
      weight: weightCol >= 0 ? header[weightCol] : null,
    },
    warnings,
  };
}

/** Read an uploaded loading list (.xlsx or .csv) and total it up. */
export function parseLoadingListWorkbook(buf: ArrayBuffer): LoadingListResult {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null }) as Grid;
  return parseLoadingListGrid(grid);
}
