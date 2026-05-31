export type Platform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "x"
  | "tiktok"
  | "threads";

export const PLATFORMS: { id: Platform; label: string; maxChars: number }[] = [
  { id: "instagram", label: "Instagram", maxChars: 2200 },
  { id: "facebook", label: "Facebook", maxChars: 63206 },
  { id: "linkedin", label: "LinkedIn", maxChars: 3000 },
  { id: "x", label: "X", maxChars: 280 },
  { id: "tiktok", label: "TikTok", maxChars: 2200 },
  { id: "threads", label: "Threads", maxChars: 500 },
];

export type PostStatus = "draft" | "scheduled" | "published" | "failed";

export interface BrandProfile {
  id: string;
  voice: string;
  tone: string;
  audience: string;
  product_list: string;
  do_words: string;
  dont_words: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  platform: Platform;
  display_name: string;
  provider_ref: string | null;
  status: "connected" | "disconnected";
  connected_at: string | null;
}

export type MediaCategory = "inspiration" | "new" | "stock" | "product";

export interface MediaAsset {
  id: string;
  /** Path within the Supabase storage bucket (cloud working copies). */
  storage_path: string | null;
  /** Direct URL — a data URL in local mode, or an external link. */
  remote_url: string | null;
  source: "upload" | "camera" | "folder" | "drive" | "url";
  category: MediaCategory;
  mime_type: string | null;
  exif: Record<string, unknown> | null;
  alt_text: string | null;
  ai_caption: string | null;
  created_at: string;
}

/** An image living in the external bank (Google Drive), browsed but not stored by the app. */
export interface BankImage {
  id: string;
  name: string;
  category: MediaCategory;
  /** For Stock: the subfolder the photo lives in, treated as its product. */
  product?: string;
  /** App-proxied URLs (the browser can't auth to Drive directly). */
  thumbnailUrl: string;
  fullUrl: string;
}

export interface Post {
  id: string;
  status: PostStatus;
  body: string;
  blog_body: string | null;
  media_asset_id: string | null;
  created_at: string;
}

export interface PostVariant {
  id: string;
  post_id: string;
  platform: Platform;
  body: string;
  hashtags: string[];
  scheduled_for: string | null;
  published_at: string | null;
  external_id: string | null;
  status: PostStatus;
  error: string | null;
}

export interface Product {
  id: string;
  source: "manual" | "static-html" | "shopify" | "woo";
  external_id: string | null;
  sku: string | null;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  image_urls: string[];
  stock: number | null;
  url: string | null;
  last_synced_at: string | null;
}

/** Shape returned by the AI generation function. */
export interface GeneratedContent {
  idea: string;
  alt_text?: string;
  variants: { platform: Platform; body: string; hashtags: string[] }[];
  blog_body?: string;
}
