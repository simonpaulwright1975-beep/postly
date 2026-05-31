import { GoogleDriveMediaSource } from "./drive";
import type { MediaSource } from "./types";

export * from "./types";

/** The active image-bank source. v1 is Google Drive (configured server-side). */
export function getMediaSource(): MediaSource {
  return new GoogleDriveMediaSource();
}
