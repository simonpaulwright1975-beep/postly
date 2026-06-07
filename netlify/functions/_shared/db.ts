// Supabase access for the Toilet Roll Sprint, scoped to the isolated
// `toilet_roll` schema so it can never touch the postly or ordering tables.
// All access is server-side with the service-role key; the browser never holds
// credentials and never reads this schema directly (RLS denies anon).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_COST_PER_CASE,
  type SaleRecord,
  type Salesperson,
} from "./calc";

const SCHEMA = "toilet_roll";

// Loosely typed: the client is scoped to the non-public `toilet_roll` schema,
// which doesn't match SupabaseClient's default "public" generic.
let client: SupabaseClient<any, any, any> | null = null;

/** Lazily build the service-role client, or throw a clear setup error. */
export function db(): SupabaseClient<any, any, any> {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.",
    );
  }
  client = createClient(url, key, {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export interface SettingsMap {
  costPerCase: number;
  promoStart: string | null;
  promoEnd: string | null;
}

export async function getSettings(): Promise<SettingsMap> {
  const { data, error } = await db().from("settings").select("key,value");
  if (error) throw error;
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const cost = Number(map.get("cost_per_case"));
  return {
    costPerCase: Number.isFinite(cost) && cost > 0 ? cost : DEFAULT_COST_PER_CASE,
    promoStart: map.get("promo_start") ?? null,
    promoEnd: map.get("promo_end") ?? null,
  };
}

export async function getSalespeople(): Promise<Salesperson[]> {
  const { data, error } = await db()
    .from("salespeople")
    .select("id,name,role,sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    role: r.role as string,
  }));
}

/** Resolve a salesperson by a free-text name (case-insensitive, trimmed). */
export function matchSalesperson(
  people: Salesperson[],
  raw: string,
): Salesperson | null {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  return (
    people.find((p) => p.name.toLowerCase() === needle) ??
    people.find((p) => p.name.toLowerCase().split(" ")[0] === needle) ??
    people.find((p) => needle.startsWith(p.name.toLowerCase().split(" ")[0])) ??
    null
  );
}

interface SaleRow {
  id: string;
  sale_date: string;
  salesperson_id: string;
  customer: string | null;
  cases: number;
  price_per_case: number;
  source: string;
  created_at: string;
}

export async function getSales(): Promise<SaleRecord[]> {
  const { data, error } = await db()
    .from("sales")
    .select("id,salesperson_id,sale_date,customer,cases,price_per_case");
  if (error) throw error;
  return (data ?? []).map(rowToRecord);
}

function rowToRecord(r: Partial<SaleRow>): SaleRecord {
  return {
    id: r.id,
    salespersonId: r.salesperson_id as string,
    saleDate: r.sale_date,
    customer: r.customer ?? undefined,
    cases: Number(r.cases),
    pricePerCase: Number(r.price_per_case),
  };
}

export interface RecentSale {
  id: string;
  saleDate: string;
  salespersonId: string;
  salespersonName: string;
  customer: string | null;
  cases: number;
  pricePerCase: number;
  source: string;
}

export async function getRecentSales(limit = 50): Promise<RecentSale[]> {
  const [people, res] = await Promise.all([
    getSalespeople(),
    db()
      .from("sales")
      .select("id,sale_date,salesperson_id,customer,cases,price_per_case,source,created_at")
      .order("sale_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (res.error) throw res.error;
  const names = new Map(people.map((p) => [p.id, p.name]));
  return (res.data ?? []).map((r: SaleRow) => ({
    id: r.id,
    saleDate: r.sale_date,
    salespersonId: r.salesperson_id,
    salespersonName: names.get(r.salesperson_id) ?? "Unknown",
    customer: r.customer,
    cases: Number(r.cases),
    pricePerCase: Number(r.price_per_case),
    source: r.source,
  }));
}

export interface NewSale {
  saleDate: string;
  salespersonId: string;
  customer: string | null;
  cases: number;
  pricePerCase: number;
  source?: string;
  sageInvoiceLineId?: string | null;
}

export async function insertSale(sale: NewSale): Promise<string> {
  const { data, error } = await db()
    .from("sales")
    .insert({
      sale_date: sale.saleDate,
      salesperson_id: sale.salespersonId,
      customer: sale.customer,
      cases: sale.cases,
      price_per_case: sale.pricePerCase,
      source: sale.source ?? "manual",
      sage_invoice_line_id: sale.sageInvoiceLineId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

export async function deleteSale(id: string): Promise<void> {
  const { error } = await db().from("sales").delete().eq("id", id);
  if (error) throw error;
}
