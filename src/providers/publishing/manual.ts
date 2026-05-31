import { PLATFORMS } from "../../lib/types";
import type { PublishInput, PublishingProvider, PublishResult } from "./types";

/** Build the full caption (body + hashtags) for copy/paste. */
export function composeCaption(input: PublishInput): string {
  const tags = input.hashtags.length
    ? "\n\n" + input.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
    : "";
  return `${input.body}${tags}`;
}

/**
 * v1 default: no API calls. Copies the caption to the clipboard so the user
 * can paste it into the platform manually. canAutoPublish is false, which the
 * scheduler/UI use to decide whether true automation is available.
 */
export class ManualPublishingProvider implements PublishingProvider {
  readonly id = "manual";
  readonly canAutoPublish = false;

  async publish(input: PublishInput): Promise<PublishResult> {
    const caption = composeCaption(input);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(caption);
    }
    const label =
      PLATFORMS.find((p) => p.id === input.platform)?.label ?? input.platform;
    return {
      externalId: null,
      published: false,
      note: `Caption copied — paste into ${label}.`,
    };
  }
}
