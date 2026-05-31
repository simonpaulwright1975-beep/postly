import { PLATFORMS, type Platform } from "../../lib/types";
import { composeCaption } from "./manual";
import type {
  PublishInput,
  PublishingProvider,
  PublishingStatus,
  PublishResult,
} from "./types";

/** Our platform ids → Ayrshare's platform names. */
const AYRSHARE_PLATFORM: Record<Platform, string> = {
  instagram: "instagram",
  facebook: "facebook",
  linkedin: "linkedin",
  x: "twitter",
  tiktok: "tiktok",
  threads: "threads",
};

/** Reverse map so the Channels page can label Ayrshare's account names. */
export function platformFromAyrshare(name: string): Platform | null {
  const entry = (Object.entries(AYRSHARE_PLATFORM) as [Platform, string][]).find(
    ([, v]) => v === name,
  );
  return entry ? entry[0] : null;
}

/** Fetch which social accounts are connected (for the Channels page). */
export async function getPublishingStatus(): Promise<PublishingStatus> {
  try {
    const r = await fetch("/api/publish?action=status");
    const data = (await r.json()) as PublishingStatus;
    return {
      configured: !!data.configured,
      accounts: data.accounts ?? [],
      error: data.error,
    };
  } catch (err) {
    return {
      configured: false,
      accounts: [],
      error: err instanceof Error ? err.message : "Could not reach publishing service.",
    };
  }
}

/**
 * Auto-posts through the Ayrshare aggregator — one server-side API key reaches
 * every connected account. When the key isn't configured yet, publish() falls
 * back to copying the caption to the clipboard so the app still works.
 */
export class AyrsharePublishingProvider implements PublishingProvider {
  readonly id = "ayrshare";
  readonly canAutoPublish = true;

  async publish(input: PublishInput): Promise<PublishResult> {
    const label =
      PLATFORMS.find((p) => p.id === input.platform)?.label ?? input.platform;
    const post = composeCaption(input);

    let data: {
      configured?: boolean;
      ok?: boolean;
      status?: string;
      id?: string;
      errors?: unknown[];
      error?: string;
    };
    try {
      const r = await fetch("/api/publish?action=post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post,
          platforms: [AYRSHARE_PLATFORM[input.platform]],
          mediaUrls: input.mediaUrls,
          scheduleDate: input.scheduleDate ?? undefined,
        }),
      });
      data = await r.json();
    } catch (err) {
      return {
        externalId: null,
        published: false,
        note: err instanceof Error ? err.message : "Publishing request failed.",
      };
    }

    // Not connected yet → graceful copy/paste fallback.
    if (data.configured === false) {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(post);
      }
      return {
        externalId: null,
        published: false,
        note: `Publishing isn't connected yet — caption copied. Connect accounts in Channels to auto-post to ${label}.`,
      };
    }

    const failed =
      data.ok === false ||
      data.status === "error" ||
      (Array.isArray(data.errors) && data.errors.length > 0);
    if (failed) {
      const detail = data.error ?? JSON.stringify(data.errors ?? data.status ?? "");
      return {
        externalId: data.id ?? null,
        published: false,
        note: `Couldn't post to ${label}: ${detail}`,
      };
    }

    const scheduled = data.status === "scheduled" || !!input.scheduleDate;
    return {
      externalId: data.id ?? null,
      published: !scheduled,
      note: scheduled
        ? `Scheduled on ${label}.`
        : `Published to ${label}.`,
    };
  }

  async cancel(externalId: string): Promise<void> {
    await fetch("/api/publish?action=cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: externalId }),
    });
  }
}
