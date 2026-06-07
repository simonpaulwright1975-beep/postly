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

const KEY = "postly:v1";

interface DB {
  brand: BrandProfile;
  posts: Post[];
  variants: PostVariant[];
  products: Product[];
  media: MediaAsset[];
  rateCards: RateCard[];
  shipments: Shipment[];
  quotes: CompetitorQuote[];
}

function uid(): string {
  return crypto.randomUUID();
}

function load(): DB {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const db = JSON.parse(raw) as DB;
      if (!db.media) db.media = []; // migrate older stored shapes
      if (!db.rateCards) db.rateCards = [];
      if (!db.shipments) db.shipments = [];
      if (!db.quotes) db.quotes = [];
      return db;
    } catch {
      /* fall through to fresh db */
    }
  }
  const fresh: DB = {
    brand: { id: "singleton", updated_at: new Date().toISOString(), ...DEFAULT_BRAND },
    posts: [],
    variants: [],
    products: [],
    media: [],
    rateCards: [],
    shipments: [],
    quotes: [],
  };
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

function save(db: DB): void {
  localStorage.setItem(KEY, JSON.stringify(db));
}

/** Browser-local persistence. Used for offline/dev and before Supabase is wired. */
export class LocalRepo implements Repo {
  async getBrandProfile(): Promise<BrandProfile> {
    return load().brand;
  }

  async saveBrandProfile(patch: Partial<BrandProfile>): Promise<BrandProfile> {
    const db = load();
    db.brand = { ...db.brand, ...patch, updated_at: new Date().toISOString() };
    save(db);
    return db.brand;
  }

  async listPosts(): Promise<PostWithVariants[]> {
    const db = load();
    return db.posts
      .map((p) => ({ ...p, variants: db.variants.filter((v) => v.post_id === p.id) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createPost(input: NewPost): Promise<PostWithVariants> {
    const db = load();
    const post: Post = {
      id: uid(),
      status: "draft",
      body: input.body,
      blog_body: input.blog_body ?? null,
      media_asset_id: null,
      created_at: new Date().toISOString(),
    };
    const variants: PostVariant[] = input.variants.map((v) => ({
      id: uid(),
      post_id: post.id,
      platform: v.platform,
      body: v.body,
      hashtags: v.hashtags,
      scheduled_for: null,
      published_at: null,
      external_id: null,
      status: "draft",
      error: null,
    }));
    db.posts.push(post);
    db.variants.push(...variants);
    save(db);
    return { ...post, variants };
  }

  async updatePost(id: string, patch: Partial<Post>): Promise<void> {
    const db = load();
    db.posts = db.posts.map((p) => (p.id === id ? { ...p, ...patch } : p));
    save(db);
  }

  async updateVariant(id: string, patch: Partial<PostVariant>): Promise<void> {
    const db = load();
    db.variants = db.variants.map((v) => (v.id === id ? { ...v, ...patch } : v));
    save(db);
  }

  async deletePost(id: string): Promise<void> {
    const db = load();
    db.posts = db.posts.filter((p) => p.id !== id);
    db.variants = db.variants.filter((v) => v.post_id !== id);
    save(db);
  }

  async listProducts(): Promise<Product[]> {
    return load().products.sort((a, b) => a.title.localeCompare(b.title));
  }

  async createProduct(input: Omit<Product, "id" | "last_synced_at">): Promise<Product> {
    const db = load();
    const product: Product = { ...input, id: uid(), last_synced_at: null };
    db.products.push(product);
    save(db);
    return product;
  }

  async updateProduct(id: string, patch: Partial<Product>): Promise<void> {
    const db = load();
    db.products = db.products.map((p) => (p.id === id ? { ...p, ...patch } : p));
    save(db);
  }

  async deleteProduct(id: string): Promise<void> {
    const db = load();
    db.products = db.products.filter((p) => p.id !== id);
    save(db);
  }

  async listMedia(category?: MediaCategory): Promise<MediaAsset[]> {
    const db = load();
    return db.media
      .filter((m) => !category || m.category === category)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createMedia(input: NewMedia): Promise<MediaAsset> {
    const db = load();
    const asset: MediaAsset = { ...input, id: uid(), created_at: new Date().toISOString() };
    db.media.push(asset);
    save(db);
    return asset;
  }

  async deleteMedia(id: string): Promise<void> {
    const db = load();
    db.media = db.media.filter((m) => m.id !== id);
    save(db);
  }

  async listRateCards(): Promise<RateCard[]> {
    return load().rateCards.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createRateCard(input: NewRateCard): Promise<RateCard> {
    const db = load();
    const card: RateCard = { ...input, id: uid(), created_at: new Date().toISOString() };
    // First card uploaded becomes the active baseline automatically.
    if (input.active || db.rateCards.length === 0) {
      db.rateCards = db.rateCards.map((c) => ({ ...c, active: false }));
      card.active = true;
    }
    db.rateCards.push(card);
    save(db);
    return card;
  }

  async updateRateCard(id: string, patch: Partial<RateCard>): Promise<void> {
    const db = load();
    db.rateCards = db.rateCards.map((c) => (c.id === id ? { ...c, ...patch } : c));
    save(db);
  }

  async deleteRateCard(id: string): Promise<void> {
    const db = load();
    const wasActive = db.rateCards.find((c) => c.id === id)?.active;
    db.rateCards = db.rateCards.filter((c) => c.id !== id);
    if (wasActive && db.rateCards.length) db.rateCards[0].active = true;
    save(db);
  }

  async setActiveRateCard(id: string): Promise<void> {
    const db = load();
    db.rateCards = db.rateCards.map((c) => ({ ...c, active: c.id === id }));
    save(db);
  }

  async listShipments(): Promise<Shipment[]> {
    return load().shipments.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createShipment(input: NewShipment): Promise<Shipment> {
    const db = load();
    const s: Shipment = { ...input, id: uid(), created_at: new Date().toISOString() };
    db.shipments.push(s);
    save(db);
    return s;
  }

  async updateShipment(id: string, patch: Partial<Shipment>): Promise<void> {
    const db = load();
    db.shipments = db.shipments.map((s) => (s.id === id ? { ...s, ...patch } : s));
    save(db);
  }

  async deleteShipment(id: string): Promise<void> {
    const db = load();
    db.shipments = db.shipments.filter((s) => s.id !== id);
    db.quotes = db.quotes.filter((q) => q.shipment_id !== id);
    save(db);
  }

  async listQuotes(): Promise<CompetitorQuote[]> {
    return load().quotes.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async createQuote(input: NewCompetitorQuote): Promise<CompetitorQuote> {
    const db = load();
    const q: CompetitorQuote = { ...input, id: uid(), created_at: new Date().toISOString() };
    db.quotes.push(q);
    save(db);
    return q;
  }

  async updateQuote(id: string, patch: Partial<CompetitorQuote>): Promise<void> {
    const db = load();
    db.quotes = db.quotes.map((q) => (q.id === id ? { ...q, ...patch } : q));
    save(db);
  }

  async deleteQuote(id: string): Promise<void> {
    const db = load();
    db.quotes = db.quotes.filter((q) => q.id !== id);
    save(db);
  }
}
