import type { BankImage, MediaCategory } from "../../lib/types";

export interface BankListing {
  /** False when the server has no Google Drive credentials yet. */
  configured: boolean;
  images: BankImage[];
}

/**
 * The seam for browsing an external image bank (the photos never enter the
 * app's own storage). v1 ships GoogleDriveMediaSource; Dropbox/OneDrive or a
 * watched folder can be swapped in without touching the UI.
 */
export interface MediaSource {
  readonly id: string;
  listBank(category: MediaCategory): Promise<BankListing>;
}
