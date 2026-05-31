import type { Platform, PostVariant } from "../../lib/types";

export interface PublishInput {
  platform: Platform;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
}

export interface PublishResult {
  /** Provider-side id for the published post, if any. */
  externalId: string | null;
  /** True when the post actually went live via an API. Manual mode is false. */
  published: boolean;
  /** Human-readable note (e.g. "Copied to clipboard — paste into Instagram"). */
  note?: string;
}

export interface VariantMetrics {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  raw: Record<string, unknown>;
}

/**
 * The seam the whole app publishes through. v1 ships ManualPublishingProvider;
 * an aggregator (Ayrshare/Postiz) or native APIs can be swapped in later
 * without touching the UI or scheduler.
 */
export interface PublishingProvider {
  readonly id: string;
  readonly canAutoPublish: boolean;
  publish(input: PublishInput): Promise<PublishResult>;
  fetchMetrics?(variant: PostVariant): Promise<VariantMetrics>;
}
