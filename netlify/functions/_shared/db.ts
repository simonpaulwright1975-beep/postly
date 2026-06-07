// Supabase access for the Sprint app, scoped to the isolated `toilet_roll`
// schema so it can never touch the postly or ordering tables. All access is
// server-side with the service-role key; the browser never holds credentials
// and never reads this schema directly (RLS denies anon).
//
// Everything is scoped to a campaign, so one deployment hosts many promotions.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CONFIG,
  type CampaignConfig,
  type BonusRung,
  type MarginTier,
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

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface CampaignRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  product_name: string;
  units_per_case: number;
  cost_per_case: number;
  price_guidance: string | null;
  promo_start: string | null;
  promo_end: string | null;
  hero_kicker: string;
  hero_title: string;
  hero_accent: string;
  subtitle: string;
  margin_tiers: MarginTier[];
  bonus_ladder: BonusRung[];
  max_individual_bonus: number;
  team_points_target: number;
  team_bonus_each: number;
  marketing_code: string | null;
}

/** Public-facing branding + config for a campaign (safe to send to the browser). */
export interface CampaignPublic {
  id: string;
  slug: string;
  name: string;
  status: string;
  productName: string;
  unitsPerCase: number;
  costPerCase: number;
  priceGuidance: string | null;
  promoStart: string | null;
  promoEnd: string | null;
  hero: { kicker: string; title: string; accent: string; subtitle: string };
  marginTiers: MarginTier[];
  bonusLadder: BonusRung[];
  maxIndividualBonus: number;
  teamPointsTarget: number;
  teamBonusEach: number;
  marketingCode: string | null;
}

const CAMPAIGN_COLS =
  "id,slug,name,status,product_name,units_per_case,cost_per_case,price_guidance," +
  "promo_start,promo_end,hero_kicker,hero_title,hero_accent,subtitle," +
  "margin_tiers,bonus_ladder,max_individual_bonus,team_points_target,team_bonus_each,marketing_code";

export function campaignConfig(row: CampaignRow): CampaignConfig {
  return {
    costPerCase: Number(row.cost_per_case) || DEFAULT_CONFIG.costPerCase,
    marginTiers: row.margin_tiers?.length ? row.margin_tiers : DEFAULT_CONFIG.marginTiers,
    bonusLadder: row.bonus_ladder?.length ? row.bonus_ladder : DEFAULT_CONFIG.bonusLadder,
    maxIndividualBonus: Number(row.max_individual_bonus) || DEFAULT_CONFIG.maxIndividualBonus,
    teamPointsTarget: Number(row.team_points_target) || DEFAULT_CONFIG.teamPointsTarget,
    teamBonusEach: Number(row.team_bonus_each) || DEFAULT_CONFIG.teamBonusEach,
  };
}

export function campaignPublic(row: CampaignRow): CampaignPublic {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    productName: row.product_name,
    unitsPerCase: row.units_per_case,
    costPerCase: Number(row.cost_per_case),
    priceGuidance: row.price_guidance,
    promoStart: row.promo_start,
    promoEnd: row.promo_end,
    hero: {
      kicker: row.hero_kicker,
      title: row.hero_title,
      accent: row.hero_accent,
      subtitle: row.subtitle,
    },
    marginTiers: row.margin_tiers?.length ? row.margin_tiers : DEFAULT_CONFIG.marginTiers,
    bonusLadder: row.bonus_ladder?.length ? row.bonus_ladder : DEFAULT_CONFIG.bonusLadder,
    maxIndividualBonus: Number(row.max_individual_bonus),
    teamPointsTarget: Number(row.team_points_target),
    teamBonusEach: Number(row.team_bonus_each),
    marketingCode: row.marketing_code ?? null,
  };
}

/** Active campaigns, for the landing page (newest first). */
export async function listCampaigns(includeAll = false): Promise<CampaignPublic[]> {
  let query = db().from("campaigns").select(CAMPAIGN_COLS).order("created_at", { ascending: true });
  if (!includeAll) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as CampaignRow[]).map((r) => campaignPublic(r));
}

export async function getCampaignById(id: string): Promise<CampaignRow | null> {
  const { data, error } = await db()
    .from("campaigns")
    .select(CAMPAIGN_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as CampaignRow) ?? null;
}

export async function getCampaignBySlug(slug: string): Promise<CampaignRow | null> {
  const { data, error } = await db()
    .from("campaigns")
    .select(CAMPAIGN_COLS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as CampaignRow) ?? null;
}

/** Resolve the campaign for a request, defaulting to the first active one. */
export async function resolveCampaign(slug: string | undefined | null): Promise<CampaignRow> {
  if (slug) {
    const row = await getCampaignBySlug(slug);
    if (!row) throw new Error(`No campaign found for "${slug}".`);
    return row;
  }
  const { data, error } = await db()
    .from("campaigns")
    .select(CAMPAIGN_COLS)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No campaigns exist yet.");
  return data as unknown as CampaignRow;
}

export interface NewCampaign {
  slug: string;
  name: string;
  status?: string;
  productName?: string;
  unitsPerCase?: number;
  costPerCase: number;
  priceGuidance?: string | null;
  promoStart?: string | null;
  promoEnd?: string | null;
  heroKicker?: string;
  heroTitle?: string;
  heroAccent?: string;
  subtitle?: string;
  marginTiers?: MarginTier[];
  bonusLadder?: BonusRung[];
  maxIndividualBonus?: number;
  teamPointsTarget?: number;
  teamBonusEach?: number;
  marketingCode?: string | null;
}

export async function insertCampaign(c: NewCampaign): Promise<CampaignPublic> {
  const { data, error } = await db()
    .from("campaigns")
    .insert({
      slug: c.slug,
      name: c.name,
      status: c.status ?? "active",
      product_name: c.productName ?? "Case",
      units_per_case: c.unitsPerCase ?? 1,
      cost_per_case: c.costPerCase,
      price_guidance: c.priceGuidance ?? null,
      promo_start: c.promoStart ?? null,
      promo_end: c.promoEnd ?? null,
      hero_kicker: c.heroKicker ?? "Promotion",
      hero_title: c.heroTitle ?? c.name,
      hero_accent: c.heroAccent ?? "",
      subtitle: c.subtitle ?? "",
      margin_tiers: c.marginTiers ?? DEFAULT_CONFIG.marginTiers,
      bonus_ladder: c.bonusLadder ?? DEFAULT_CONFIG.bonusLadder,
      max_individual_bonus: c.maxIndividualBonus ?? DEFAULT_CONFIG.maxIndividualBonus,
      team_points_target: c.teamPointsTarget ?? DEFAULT_CONFIG.teamPointsTarget,
      team_bonus_each: c.teamBonusEach ?? DEFAULT_CONFIG.teamBonusEach,
      marketing_code: c.marketingCode ?? null,
    })
    .select(CAMPAIGN_COLS)
    .single();
  if (error) throw error;
  return campaignPublic(data as unknown as CampaignRow);
}

const UPDATE_FIELD_MAP: Record<string, string> = {
  name: "name",
  status: "status",
  productName: "product_name",
  unitsPerCase: "units_per_case",
  costPerCase: "cost_per_case",
  priceGuidance: "price_guidance",
  promoStart: "promo_start",
  promoEnd: "promo_end",
  heroKicker: "hero_kicker",
  heroTitle: "hero_title",
  heroAccent: "hero_accent",
  subtitle: "subtitle",
  marginTiers: "margin_tiers",
  bonusLadder: "bonus_ladder",
  maxIndividualBonus: "max_individual_bonus",
  teamPointsTarget: "team_points_target",
  teamBonusEach: "team_bonus_each",
  marketingCode: "marketing_code",
};

export async function updateCampaign(
  id: string,
  patch: Record<string, unknown>,
): Promise<CampaignPublic> {
  const row: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(UPDATE_FIELD_MAP)) {
    if (patch[key] !== undefined) row[col] = patch[key];
  }
  const { data, error } = await db()
    .from("campaigns")
    .update(row)
    .eq("id", id)
    .select(CAMPAIGN_COLS)
    .single();
  if (error) throw error;
  return campaignPublic(data as unknown as CampaignRow);
}

export interface DuplicateInput {
  sourceId: string;
  name: string;
  slug: string;
  promoStart?: string | null;
  promoEnd?: string | null;
  copySalespeople?: boolean;
}

/**
 * "Run again": clone an existing campaign (product, cost, branding and scoring)
 * into a fresh active campaign with new dates and zero sales, optionally copying
 * the salespeople. The source is left untouched, so an archived month keeps its
 * data and results intact. The marketing code is deliberately not carried over —
 * a new run picks a fresh code.
 */
export async function duplicateCampaign(d: DuplicateInput): Promise<CampaignPublic> {
  const src = await getCampaignById(d.sourceId);
  if (!src) throw new Error("Source campaign not found.");

  const created = await insertCampaign({
    slug: d.slug,
    name: d.name,
    status: "active",
    productName: src.product_name,
    unitsPerCase: src.units_per_case,
    costPerCase: Number(src.cost_per_case),
    priceGuidance: src.price_guidance,
    promoStart: d.promoStart ?? null,
    promoEnd: d.promoEnd ?? null,
    heroKicker: src.hero_kicker,
    heroTitle: src.hero_title,
    heroAccent: src.hero_accent,
    subtitle: src.subtitle,
    marginTiers: src.margin_tiers,
    bonusLadder: src.bonus_ladder,
    maxIndividualBonus: Number(src.max_individual_bonus),
    teamPointsTarget: Number(src.team_points_target),
    teamBonusEach: Number(src.team_bonus_each),
    marketingCode: null,
  });

  if (d.copySalespeople) {
    const people = await getSalespeople(d.sourceId);
    let order = 1;
    for (const p of people) {
      await addSalesperson(created.id, p.name, p.role, order++);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Salespeople
// ---------------------------------------------------------------------------

export async function getSalespeople(campaignId: string): Promise<Salesperson[]> {
  const { data, error } = await db()
    .from("salespeople")
    .select("id,name,role,sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, role: r.role as string }));
}

export async function addSalesperson(
  campaignId: string,
  name: string,
  role: string,
  sortOrder: number,
): Promise<Salesperson> {
  const { data, error } = await db()
    .from("salespeople")
    .insert({ campaign_id: campaignId, name, role, sort_order: sortOrder })
    .select("id,name,role")
    .single();
  if (error) throw error;
  return { id: data!.id as string, name: data!.name as string, role: data!.role as string };
}

export async function deleteSalesperson(campaignId: string, id: string): Promise<void> {
  const { error } = await db()
    .from("salespeople")
    .delete()
    .eq("id", id)
    .eq("campaign_id", campaignId);
  if (error) throw error;
}

/** Resolve a salesperson by a free-text name (case-insensitive, trimmed). */
export function matchSalesperson(people: Salesperson[], raw: string): Salesperson | null {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  const first = (p: Salesperson) => p.name.toLowerCase().split(" ")[0];
  return (
    people.find((p) => p.name.toLowerCase() === needle) ??
    people.find((p) => first(p) === needle) ??
    people.find((p) => needle.startsWith(first(p))) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

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

export async function getSales(campaignId: string): Promise<SaleRecord[]> {
  const { data, error } = await db()
    .from("sales")
    .select("id,salesperson_id,sale_date,customer,cases,price_per_case")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return (data ?? []).map((r: Partial<SaleRow>) => ({
    id: r.id,
    salespersonId: r.salesperson_id as string,
    saleDate: r.sale_date,
    customer: r.customer ?? undefined,
    cases: Number(r.cases),
    pricePerCase: Number(r.price_per_case),
  }));
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

export async function getRecentSales(campaignId: string, limit = 100): Promise<RecentSale[]> {
  const [people, res] = await Promise.all([
    getSalespeople(campaignId),
    db()
      .from("sales")
      .select("id,sale_date,salesperson_id,customer,cases,price_per_case,source,created_at")
      .eq("campaign_id", campaignId)
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
  campaignId: string;
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
      campaign_id: sale.campaignId,
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

export async function deleteSale(campaignId: string, id: string): Promise<void> {
  const { error } = await db().from("sales").delete().eq("id", id).eq("campaign_id", campaignId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Marketing-app integration (public schema, same WG Main database)
// ---------------------------------------------------------------------------

/** The `source` value used to identify Sprint-owned promotions rows. */
export const PROMOTION_SOURCE = "toilet-roll-sprint";

export interface MarketingCode {
  code: string;
  label: string;
  group: string | null;
  active: boolean;
}

/**
 * Active marketing codes from the marketing app's master view. Used to populate
 * the Director's "marketing code" dropdown so a sprint is tagged with a real,
 * approved campaign_ref.
 */
export async function listMarketingCodes(): Promise<MarketingCode[]> {
  const { data, error } = await db()
    .schema("public")
    .from("vw_campaign_codes_master")
    .select("code,label,group_type,display_order,active")
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    code: r.code as string,
    label: (r.label as string) ?? (r.code as string),
    group: (r.group_type as string) ?? null,
    active: Boolean(r.active),
  }));
}

export interface PromotionRoi {
  id: number;
  name: string;
  campaignRef: string | null;
  spendActual: number;
  actualGp: number;
  roiPct: number | null;
  marketingAppUrl: string | null;
  created: boolean;
}

export interface RoiUpsert {
  slug: string;
  name: string;
  marketingCode: string | null;
  startDate: string | null;
  endDate: string | null;
  actualGp: number;
  spendActual: number;
  marketingAppUrl: string | null;
  status: string;
}

/**
 * Register the sprint's ROI in the marketing app by upserting a single
 * public.promotions row, keyed by (source, source_external_id) so it is
 * idempotent and never duplicates. actual_gp is the return, spend_actual the
 * bonus pot invested. Returns the resulting row plus a computed ROI %.
 *
 * Guarded by MARKETING_ROI_ENABLED so it cannot write to production until the
 * integration is deliberately switched on.
 */
export async function upsertPromotionRoi(u: RoiUpsert): Promise<PromotionRoi> {
  const roiPct = u.spendActual > 0 ? round(((u.actualGp - u.spendActual) / u.spendActual) * 100) : null;

  if (process.env.MARKETING_ROI_ENABLED !== "true") {
    // Dry run: compute and return without touching the marketing tables.
    return {
      id: 0,
      name: u.name,
      campaignRef: u.marketingCode,
      spendActual: u.spendActual,
      actualGp: u.actualGp,
      roiPct,
      marketingAppUrl: u.marketingAppUrl,
      created: false,
    };
  }

  const promotions = db().schema("public").from("promotions");
  const { data: existing, error: findErr } = await promotions
    .select("id")
    .eq("source", PROMOTION_SOURCE)
    .eq("source_external_id", u.slug)
    .maybeSingle();
  if (findErr) throw findErr;

  const payload: Record<string, unknown> = {
    name: u.name,
    campaign_ref: u.marketingCode,
    start_date: u.startDate,
    end_date: u.endDate,
    actual_gp: u.actualGp,
    spend_actual: u.spendActual,
    status: u.status,
    source: PROMOTION_SOURCE,
    source_external_id: u.slug,
    marketing_app_url: u.marketingAppUrl,
    updated_at: new Date().toISOString(),
  };

  const existingId = (existing as { id?: number } | null)?.id;
  const result = existingId
    ? await promotions.update(payload).eq("id", existingId).select("id").single()
    : await promotions.insert(payload).select("id").single();
  if (result.error) throw result.error;

  return {
    id: (result.data as { id: number }).id,
    name: u.name,
    campaignRef: u.marketingCode,
    spendActual: u.spendActual,
    actualGp: u.actualGp,
    roiPct,
    marketingAppUrl: u.marketingAppUrl,
    created: !existingId,
  };
}

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
