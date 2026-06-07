// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = import("@supabase/supabase-js").SupabaseClient<any, any, any, any, any>;
import type { BrandProfile, MediaAsset, MediaCategory, Post, PostVariant, Product } from "../types";
import type {
  CompetitorQuote,
  NewCompetitorQuote,
  NewRateCard,
  NewShipment,
  RateCard,
  Shipment,
} from "../shipping/types";
import {
  DEFAULT_BRAND,
  type NewMedia,
  type NewPost,
  type PostWithVariants,
  type Repo,
} from "./types";

/**
 * Shipping records (rate cards, shipments, quotes) are stored with their full
 * object graph in a `data` jsonb column; `id`/`created_at` (and `active` for
 * rate cards) are promoted to real columns for ordering and filtering.
 */
function rowToCard(row: { id: string; active: boolean; created_at: string; data: unknown }): RateCard {
  return { ...(row.data as object), id: row.id, active: row.active, created_at: row.created_at } as RateCard;
}
function rowToShipment(row: { id: string; created_at: string; data: unknown }): Shipment {
  return { ...(row.data as object), id: row.id, created_at: row.created_at } as Shipment;
}
function rowToQuote(row: { id: string; created_at: string; data: unknown }): CompetitorQuote {
  return { ...(row.data as object), id: row.id, created_at: row.created_at } as CompetitorQuote;
}

/** Supabase-backed persistence. Active when VITE_SUPABASE_* env vars are set. */
export class SupabaseRepo implements Repo {
  constructor(private readonly db: DbClient) {}

  async getBrandProfile(): Promise<BrandProfile> {
    const { data, error } = await this.db
      .from("brand_profile")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as BrandProfile;

    const seed = { ...DEFAULT_BRAND, updated_at: new Date().toISOString() };
    const inserted = await this.db.from("brand_profile").insert(seed).select().single();
    if (inserted.error) throw inserted.error;
    return inserted.data as BrandProfile;
  }

  async saveBrandProfile(patch: Partial<BrandProfile>): Promise<BrandProfile> {
    const current = await this.getBrandProfile();
    const { data, error } = await this.db
      .from("brand_profile")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", current.id)
      .select()
      .single();
    if (error) throw error;
    return data as BrandProfile;
  }

  async listPosts(): Promise<PostWithVariants[]> {
    const { data, error } = await this.db
      .from("posts")
      .select("*, variants:post_variants(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as PostWithVariants[];
  }

  async createPost(input: NewPost): Promise<PostWithVariants> {
    const { data: post, error } = await this.db
      .from("posts")
      .insert({ status: "draft", body: input.body, blog_body: input.blog_body ?? null })
      .select()
      .single();
    if (error) throw error;

    const rows = input.variants.map((v) => ({
      post_id: (post as Post).id,
      platform: v.platform,
      body: v.body,
      hashtags: v.hashtags,
      status: "draft",
    }));
    const { data: variants, error: vErr } = await this.db
      .from("post_variants")
      .insert(rows)
      .select();
    if (vErr) throw vErr;

    return { ...(post as Post), variants: (variants ?? []) as PostVariant[] };
  }

  async updatePost(id: string, patch: Partial<Post>): Promise<void> {
    const { error } = await this.db.from("posts").update(patch).eq("id", id);
    if (error) throw error;
  }

  async updateVariant(id: string, patch: Partial<PostVariant>): Promise<void> {
    const { error } = await this.db.from("post_variants").update(patch).eq("id", id);
    if (error) throw error;
  }

  async deletePost(id: string): Promise<void> {
    const { error } = await this.db.from("posts").delete().eq("id", id);
    if (error) throw error;
  }

  async listProducts(): Promise<Product[]> {
    const { data, error } = await this.db
      .from("products")
      .select("*")
      .order("title", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Product[];
  }

  async createProduct(input: Omit<Product, "id" | "last_synced_at">): Promise<Product> {
    const { data, error } = await this.db
      .from("products")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as Product;
  }

  async updateProduct(id: string, patch: Partial<Product>): Promise<void> {
    const { error } = await this.db.from("products").update(patch).eq("id", id);
    if (error) throw error;
  }

  async deleteProduct(id: string): Promise<void> {
    const { error } = await this.db.from("products").delete().eq("id", id);
    if (error) throw error;
  }

  async listMedia(category?: MediaCategory): Promise<MediaAsset[]> {
    let q = this.db.from("media_assets").select("*").order("created_at", { ascending: false });
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MediaAsset[];
  }

  async createMedia(input: NewMedia): Promise<MediaAsset> {
    const { data, error } = await this.db.from("media_assets").insert(input).select().single();
    if (error) throw error;
    return data as MediaAsset;
  }

  async deleteMedia(id: string): Promise<void> {
    const { error } = await this.db.from("media_assets").delete().eq("id", id);
    if (error) throw error;
  }

  async listRateCards(): Promise<RateCard[]> {
    const { data, error } = await this.db
      .from("rate_cards")
      .select("id, active, created_at, data")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToCard);
  }

  async createRateCard(input: NewRateCard): Promise<RateCard> {
    const existing = await this.listRateCards();
    const active = input.active || existing.length === 0;
    if (active && existing.length) {
      const { error: clr } = await this.db.from("rate_cards").update({ active: false }).not("id", "is", null);
      if (clr) throw clr;
    }
    const { active: _omit, ...data } = input;
    const { data: row, error } = await this.db
      .from("rate_cards")
      .insert({ active, data })
      .select("id, active, created_at, data")
      .single();
    if (error) throw error;
    return rowToCard(row);
  }

  async updateRateCard(id: string, patch: Partial<RateCard>): Promise<void> {
    const current = (await this.listRateCards()).find((c) => c.id === id);
    if (!current) return;
    const merged = { ...current, ...patch };
    const { id: _i, created_at: _c, active, ...data } = merged;
    const { error } = await this.db.from("rate_cards").update({ active, data }).eq("id", id);
    if (error) throw error;
  }

  async deleteRateCard(id: string): Promise<void> {
    const { error } = await this.db.from("rate_cards").delete().eq("id", id);
    if (error) throw error;
    const remaining = await this.listRateCards();
    if (remaining.length && !remaining.some((c) => c.active)) {
      await this.setActiveRateCard(remaining[0].id);
    }
  }

  async setActiveRateCard(id: string): Promise<void> {
    const { error: clr } = await this.db.from("rate_cards").update({ active: false }).neq("id", id);
    if (clr) throw clr;
    const { error } = await this.db.from("rate_cards").update({ active: true }).eq("id", id);
    if (error) throw error;
  }

  async listShipments(): Promise<Shipment[]> {
    const { data, error } = await this.db
      .from("shipments")
      .select("id, created_at, data")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToShipment);
  }

  async createShipment(input: NewShipment): Promise<Shipment> {
    const { data: row, error } = await this.db
      .from("shipments")
      .insert({ data: input })
      .select("id, created_at, data")
      .single();
    if (error) throw error;
    return rowToShipment(row);
  }

  async updateShipment(id: string, patch: Partial<Shipment>): Promise<void> {
    const current = (await this.listShipments()).find((s) => s.id === id);
    if (!current) return;
    const { id: _i, created_at: _c, ...data } = { ...current, ...patch };
    const { error } = await this.db.from("shipments").update({ data }).eq("id", id);
    if (error) throw error;
  }

  async deleteShipment(id: string): Promise<void> {
    const { error } = await this.db.from("shipments").delete().eq("id", id);
    if (error) throw error;
  }

  async listQuotes(): Promise<CompetitorQuote[]> {
    const { data, error } = await this.db
      .from("competitor_quotes")
      .select("id, created_at, data")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToQuote);
  }

  async createQuote(input: NewCompetitorQuote): Promise<CompetitorQuote> {
    const { data: row, error } = await this.db
      .from("competitor_quotes")
      .insert({ data: input })
      .select("id, created_at, data")
      .single();
    if (error) throw error;
    return rowToQuote(row);
  }

  async updateQuote(id: string, patch: Partial<CompetitorQuote>): Promise<void> {
    const current = (await this.listQuotes()).find((q) => q.id === id);
    if (!current) return;
    const { id: _i, created_at: _c, ...data } = { ...current, ...patch };
    const { error } = await this.db.from("competitor_quotes").update({ data }).eq("id", id);
    if (error) throw error;
  }

  async deleteQuote(id: string): Promise<void> {
    const { error } = await this.db.from("competitor_quotes").delete().eq("id", id);
    if (error) throw error;
  }
}
