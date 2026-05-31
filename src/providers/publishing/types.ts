import type { Platform, PostVariant } from "../../lib/types";

export interface PublishInput {
  platform: Platform;
  body: string;
  hashtags: string[];
  mediaUrls: string[];
  /** ISO timestamp to schedule for. Omit/null to publish immediately. */
  scheduleDate?: string | null;
}

/** Connection state of the aggregator, surfaced on the Channels page. */
export interface PublishingStatus {
  /** True when an API key is configured on the server. */
  configured: boolean;
  /** Aggregator platform names that are linked (e.g. "twitter", "facebook"). */
  accounts: string[];
  error?: string;
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
  /** Delete/unschedule a previously scheduled post by its provider id. */
  cancel?(externalId: string): Promise<void>;
  fetchMetrics?(variant: PostVariant): Promise<VariantMetrics>;
}
