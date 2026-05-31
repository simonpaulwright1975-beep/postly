import type { BrandProfile, MediaAsset, MediaCategory, Post, PostVariant, Product } from "../types";

export type PostWithVariants = Post & { variants: PostVariant[] };

export type NewMedia = Omit<MediaAsset, "id" | "created_at">;

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

  listMedia(category?: MediaCategory): Promise<MediaAsset[]>;
  createMedia(input: NewMedia): Promise<MediaAsset>;
  deleteMedia(id: string): Promise<void>;
}

export const DEFAULT_BRAND: Omit<BrandProfile, "id" | "updated_at"> = {
  voice:
    "Warm, calm and quietly confident — sensory and deeply human, never clinical or salesy. TUMCH speaks in gentle, lightly poetic language about how little rituals can change the way you feel: a calming fragrance that makes you pause, a balm that soothes the senses, a thoughtful gift that brings a smile. Every product is framed as a moment of wellbeing in the middle of everyday life — space to pause, breathe and restore. Premium and considered, yet reassuring and down-to-earth. Signature ideas: \"little rituals, extraordinary results\" and \"too much of a good thing can be wonderful.\" Sustainability and kindness run through everything (organic, vegan-friendly, UK-made), and a percentage of every sale supports the mental-health charity Mind.",
  tone: "Reassuring, unhurried and softly evocative. Premium but approachable; never hyped, pushy or pseudo-medical. Invites rather than instructs (\"create space to breathe, unwind and restore\"). Leans on scent, texture and feeling over specs, urgency or discounts. Self-care is treated as essential, not indulgent.",
  audience:
    "UK wellness-minded adults seeking everyday calm and self-care; thoughtful gift-buyers; and hospitality/trade clients — hotels, holiday parks and serviced accommodation wanting premium, bespoke-branded check-in welcome gifts. Also dog owners (pet balm range). The brand is enquiry-led with no public retail prices.",
  product_list:
    "Mindfulness fragrance balms — alcohol-free solid-wax scent applied to pulse points (cologne & perfume profiles). Lifestyle balms: Sleep, Calm, Focus, Anxiety, Energy. Routine check-in gift sets for hotels & holiday parks (bespoke property branding available). Lifestyle pet balms (Paw Care, Calming Dog). Lifestyle gifts — diffusers, bath salts, mindfulness notepads, hampers and Pass It Forward cards. All organic, natural, vegan-friendly, UK-manufactured and tested to UK cosmetic regulations.",
  do_words:
    "little rituals, pause, breathe, unwind, restore, calm, balance, wellbeing, sensory, mindful, moment, moments that matter, gentle, soothe, nourish, present, confidence, joy, organic, natural, sustainable, skin-friendly, thoughtful, gift, made in the UK, self-care",
  dont_words:
    "cure, treat, fix, clinical or medical claims, miracle, hype, cheap, bargain, discount-led urgency, alcohol-based, synthetic, mass-produced; no public prices (enquiry-led only)",
};
