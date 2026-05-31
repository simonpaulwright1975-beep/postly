import type { CatalogueSource, ProductSync } from "./types";

/**
 * v1 default for TUMCH: the brand site is hand-coded static HTML with no
 * product API and no prices, so products are managed by hand in the app.
 * There is nothing to pull, hence canSync is false.
 */
export class ManualCatalogueSource implements CatalogueSource {
  readonly id = "manual";
  readonly canSync = false;

  async fetchProducts(): Promise<ProductSync[]> {
    return [];
  }
}
