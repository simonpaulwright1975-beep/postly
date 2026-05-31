import type { BankImage, MediaAsset } from "./types";

export type ImageRole = "attach" | "inspiration";

export interface ImageHandoff {
  role: ImageRole;
  kind: "bank" | "asset";
  image: BankImage | MediaAsset;
  label: string;
}

const KEY = "postly:image-handoff";

/** Stash an image picked in the Media Library for the Generate page to pick up. */
export function stashImage(h: ImageHandoff): void {
  sessionStorage.setItem(KEY, JSON.stringify(h));
}

/** Consume a stashed image (one-shot). */
export function takeImage(): ImageHandoff | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as ImageHandoff;
  } catch {
    return null;
  }
}
