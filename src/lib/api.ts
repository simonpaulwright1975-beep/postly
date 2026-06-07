import type { BrandProfile, GeneratedContent, Platform, Product } from "./types";

/** A base64 image handed to Claude vision, tagged by how it should be used. */
export interface GenerateImage {
  /** "attach" = the photo being posted (ground caption + alt text on it).
   *  "inspiration" = mood/tone reference only, never described literally. */
  role: "attach" | "inspiration";
  media_type: string;
  data: string;
  /** For Stock photos: the product (subfolder) name, so the post is product-aware. */
  product?: string;
}

export interface GenerateRequest {
  prompt?: string;
  product?: Pick<Product, "title" | "description" | "price" | "currency">;
  platforms: Platform[];
  includeBlog: boolean;
  images?: GenerateImage[];
  brand: Pick<
    BrandProfile,
    "voice" | "tone" | "audience" | "product_list" | "do_words" | "dont_words"
  >;
}

/**
 * Calls the server-side Netlify function that talks to Claude. The Anthropic
 * key never reaches the browser — it stays in the function's environment.
 */
export async function generateContent(
  req: GenerateRequest,
): Promise<GeneratedContent> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Generation failed (${res.status})`);
  }
  return (await res.json()) as GeneratedContent;
}
