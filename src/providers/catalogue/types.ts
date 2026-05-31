import type { Product } from "../../lib/types";

export type ProductSync = Omit<Product, "id" | "last_synced_at">;

/**
 * The seam the Catalogue tab syncs through. v1 ships ManualCatalogueSource
 * (products entered and edited in-app). A static-HTML scraper or a
 * Shopify/Woo source can be swapped in later without UI changes.
 */
export interface CatalogueSource {
  readonly id: string;
  /** True when the source can pull products automatically (manual = false). */
  readonly canSync: boolean;
  /** Pull products from the source. Manual source returns []. */
  fetchProducts(): Promise<ProductSync[]>;
}
