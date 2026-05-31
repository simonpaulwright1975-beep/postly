import { AyrsharePublishingProvider } from "./ayrshare";
import { ManualPublishingProvider } from "./manual";
import type { PublishingProvider } from "./types";

export * from "./types";
export { composeCaption } from "./manual";
export { getPublishingStatus, platformFromAyrshare } from "./ayrshare";

/**
 * The aggregator-backed provider. It auto-posts when an Ayrshare key is set on
 * the server, and gracefully falls back to copying the caption when it isn't —
 * so it's always safe to return.
 */
export function getPublishingProvider(): PublishingProvider {
  return new AyrsharePublishingProvider();
}

/** The always-copy provider, for the explicit "Copy caption" action. */
export function getManualProvider(): PublishingProvider {
  return new ManualPublishingProvider();
}
