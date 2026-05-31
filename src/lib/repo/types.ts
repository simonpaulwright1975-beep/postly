import type { BrandProfile, Post, PostVariant, Product } from "../types";

export type PostWithVariants = Post & { variants: PostVariant[] };

export interface NewVariant {
  platform: PostVariant["platform"];
  body: string;
  hashtags: string[];
}

export interface NewPost {
  body: string;
  blog_body?: string | null;
  variants: NewVariant[];
}

/**
 * Persistence seam. The localStorage adapter powers offline/dev use; the
 * Supabase adapter is used the moment VITE_SUPABASE_* env vars are present.
 * Same swap-the-implementation pattern as PublishingProvider / CatalogueSource.
 */
export interface Repo {
  getBrandProfile(): Promise<BrandProfile>;
  saveBrandProfile(patch: Partial<BrandProfile>): Promise<BrandProfile>;

  listPosts(): Promise<PostWithVariants[]>;
  createPost(input: NewPost): Promise<PostWithVariants>;
  updatePost(id: string, patch: Partial<Post>): Promise<void>;
  updateVariant(id: string, patch: Partial<PostVariant>): Promise<void>;
  deletePost(id: string): Promise<void>;

  listProducts(): Promise<Product[]>;
  createProduct(input: Omit<Product, "id" | "last_synced_at">): Promise<Product>;
  updateProduct(id: string, patch: Partial<Product>): Promise<void>;
  deleteProduct(id: string): Promise<void>;
}

export const DEFAULT_BRAND: Omit<BrandProfile, "id" | "updated_at"> = {
  voice:
    "Warm, calm and quietly confident. Sensory and human, never clinical. Speaks to everyday wellbeing and small rituals.",
  tone: "Reassuring, unhurried, premium but approachable.",
  audience:
    "UK wellness-minded adults, gift-buyers, and hospitality/trade clients (hotels, holiday parks).",
  product_list:
    "Fragrance balms, lifestyle balms (calming, sleep), routine check-in gift sets, pet balms, lifestyle gifts, letterbox games.",
  do_words: "ritual, calm, organic, mindful, present, sensory, wellbeing, gift",
  dont_words: "cure, medical claims, cheap, hype, miracle",
};
