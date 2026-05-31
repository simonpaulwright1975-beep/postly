import type { MediaCategory } from "../../lib/types";
import type { BankListing, MediaSource } from "./types";

/** Reads the photo bank from Google Drive via the server-side /api/drive function. */
export class GoogleDriveMediaSource implements MediaSource {
  readonly id = "google-drive";

  async listBank(category: MediaCategory): Promise<BankListing> {
    const res = await fetch(`/api/drive?action=list&category=${category}`);
    if (!res.ok) {
      throw new Error((await res.text()) || `Drive list failed (${res.status})`);
    }
    return (await res.json()) as BankListing;
  }
}
