import { MEDIA_BUCKET, supabase } from "./supabase";
import { getRepo } from "./repo";
import type { BankImage, MediaAsset, MediaCategory } from "./types";

/** Downscale + re-encode an image so stored working copies stay small. */
export async function compressImage(
  file: Blob,
  maxDim = 1600,
  quality = 0.82,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image encode failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Store a compressed working copy of an image and record it. Cloud: uploads to
 * Supabase Storage. Local mode: keeps a compressed data URL in the browser store.
 */
export async function addImage(
  file: Blob,
  category: MediaCategory,
  meta: { alt_text?: string; ai_caption?: string; source?: MediaAsset["source"] } = {},
): Promise<MediaAsset> {
  const blob = await compressImage(file);
  const repo = getRepo();
  const base = {
    category,
    mime_type: "image/jpeg",
    source: meta.source ?? ("upload" as const),
    exif: null,
    alt_text: meta.alt_text ?? null,
    ai_caption: meta.ai_caption ?? null,
  };

  if (supabase) {
    const path = `${category}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return repo.createMedia({ ...base, storage_path: path, remote_url: null });
  }

  const dataUrl = await blobToDataUrl(blob);
  return repo.createMedia({ ...base, storage_path: null, remote_url: dataUrl });
}

/** A URL usable in an <img> tag for a stored asset (signed for cloud copies). */
export async function mediaSrc(asset: MediaAsset): Promise<string> {
  if (asset.remote_url) return asset.remote_url;
  if (asset.storage_path && supabase) {
    const { data } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(asset.storage_path, 3600);
    return data?.signedUrl ?? "";
  }
  return "";
}

/** Fetch any image URL (bank, signed, or data URL) as a base64 payload for Claude vision. */
export async function urlToBase64(
  url: string,
): Promise<{ media_type: string; data: string }> {
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUrl = await blobToDataUrl(blob);
  const [head, data] = dataUrl.split(",");
  const media_type = head.slice(head.indexOf(":") + 1, head.indexOf(";")) || "image/jpeg";
  return { media_type, data };
}

/** Resolve a displayable + vision-ready source for either a stored asset or a bank image. */
export async function resolveImageBase64(
  src: MediaAsset | BankImage,
): Promise<{ media_type: string; data: string }> {
  const url = "fullUrl" in src ? src.fullUrl : await mediaSrc(src);
  return urlToBase64(url);
}
