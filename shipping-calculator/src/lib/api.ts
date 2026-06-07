import type { LoadingListResult } from "./shipping/parseLoadingList";

/** A loading-list read result, plus the origin port Claude spotted (if any). */
export type LoadingListReadResult = LoadingListResult & { originPort: string };

interface LoadingListApiResponse {
  total_cartons: number;
  total_cbm: number;
  total_weight_kg: number;
  line_items: number;
  origin_port?: string;
  warnings: string[];
}

/**
 * Reads a PDF loading list via Claude (server-side function) and normalises the
 * result into the same shape the spreadsheet parser returns, so the UI can treat
 * both identically. The Anthropic key never reaches the browser.
 */
export async function readLoadingListPdf(
  data: string,
  fileName: string,
): Promise<LoadingListReadResult> {
  const res = await fetch("/api/loading-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, media_type: "application/pdf", file_name: fileName }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Reading the PDF failed (${res.status})`);
  }
  const r = (await res.json()) as LoadingListApiResponse;
  return {
    totalCartons: Math.round(r.total_cartons || 0),
    totalCbm: Math.round((r.total_cbm || 0) * 1000) / 1000,
    totalWeightKg: Math.round((r.total_weight_kg || 0) * 100) / 100,
    lineItems: r.line_items || 0,
    originPort: r.origin_port?.trim() || "",
    detected: { cartons: "read by AI", cbm: "read by AI", weight: "read by AI" },
    warnings: r.warnings ?? [],
  };
}
