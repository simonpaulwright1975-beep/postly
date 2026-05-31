import { ManualCatalogueSource } from "./manual";
import type { CatalogueSource } from "./types";

export * from "./types";

/**
 * Returns the active catalogue source. v1 returns the manual source; later
 * phases switch on CATALOGUE_SOURCE for static-html / shopify / woo.
 */
export function getCatalogueSource(): CatalogueSource {
  return new ManualCatalogueSource();
}
