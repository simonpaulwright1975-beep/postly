import { ManualPublishingProvider } from "./manual";
import type { PublishingProvider } from "./types";

export * from "./types";
export { composeCaption } from "./manual";

/**
 * Returns the active publishing provider. v1 always returns the manual
 * provider; later phases switch on PUBLISHING_PROVIDER to return an
 * aggregator-backed or native implementation.
 */
export function getPublishingProvider(): PublishingProvider {
  return new ManualPublishingProvider();
}
