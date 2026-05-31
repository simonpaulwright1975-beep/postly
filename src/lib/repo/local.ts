import type { BrandProfile, MediaAsset, MediaCategory, Post, PostVariant, Product } from "../types";
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
}
