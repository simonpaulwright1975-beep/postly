// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = import("@supabase/supabase-js").SupabaseClient<any, any, any, any, any>;
import type { BrandProfile, MediaAsset, MediaCategory, Post, PostVariant, Product } from "../types";
import {
  DEFAULT_BRAND,
  type NewMedia,
  type NewPost,
  type PostWithVariants,
  type Repo,
} from "./types";

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
}
