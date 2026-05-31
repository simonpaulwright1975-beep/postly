import { PLATFORMS } from "../../lib/types";
import { composeCaption } from "./manual";
import type {
  PublishInput,
  PublishingProvider,
  PublishingStatus,
  PublishResult,
} from "./types";

/** Fetch which channels are connected (for the Channels page). */
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
      error:
        err instanceof Error ? err.message : "Could not reach publishing service.",
    };
  }
}

/**
 * Auto-posts through the Postiz aggregator — one server-side API key reaches
 * every connected channel. When the key isn't configured yet, publish() falls
 * back to copying the caption to the clipboard so the app still works.
 */
export class PostizPublishingProvider implements PublishingProvider {
  readonly id = "postiz";
  readonly canAutoPublish = true;

  async publish(input: PublishInput): Promise<PublishResult> {
    const label =
      PLATFORMS.find((p) => p.id === input.platform)?.label ?? input.platform;
    const content = composeCaption(input);

    let data: {
      configured?: boolean;
      ok?: boolean;
      scheduled?: boolean;
      id?: string | null;
      error?: string;
    };
    try {
      const r = await fetch("/api/publish?action=post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: input.platform,
          content,
          image: [],
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
        await navigator.clipboard.writeText(content);
      }
      return {
        externalId: null,
        published: false,
        note: `Publishing isn't connected yet — caption copied. Connect accounts in Channels to auto-post to ${label}.`,
      };
    }

    if (data.ok === false || data.error) {
      return {
        externalId: data.id ?? null,
        published: false,
        note: `Couldn't post to ${label}: ${data.error ?? "Postiz rejected the request."}`,
      };
    }

    const scheduled = !!data.scheduled;
    return {
      externalId: data.id ?? null,
      published: !scheduled,
      note: scheduled ? `Scheduled on ${label}.` : `Published to ${label}.`,
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
