import type { Handler } from "@netlify/functions";

/**
 * Aggregator publishing via Postiz. The API key lives ONLY in this server-side
 * function (POSTIZ_API_KEY) — never shipped to the browser. The frontend talks
 * to /api/publish; this proxies to Postiz so one key reaches every connected
 * channel.
 *
 * Postiz cloud:  https://api.postiz.com/public/v1
 * Self-hosted:   set POSTIZ_API_URL to your instance's /public/v1 URL.
 *
 * Actions:
 *   ?action=status  GET   → which of our platforms are connected
 *   ?action=post    POST  → publish now or schedule (scheduleDate)
 *   ?action=cancel  POST  → delete/unschedule a post by Postiz id
 */
const DEFAULT_BASE = "https://api.postiz.com/public/v1";

// Our platform ids (kept inline so this server bundle has no app imports).
const PLATFORM_IDS = [
  "instagram",
  "facebook",
  "linkedin",
  "x",
  "tiktok",
  "threads",
] as const;

interface Integration {
  id: string;
  name?: string;
  identifier?: string;
  providerIdentifier?: string;
  provider?: string;
  disabled?: boolean;
}

/** Map a Postiz integration's provider string to one of our platform ids. */
function resolvePlatform(integration: Integration): string | null {
  const id = (
    integration.identifier ??
    integration.providerIdentifier ??
    integration.provider ??
    ""
  ).toLowerCase();
  for (const p of PLATFORM_IDS) {
    if (p === "x") {
      if (id.startsWith("x") || id.includes("twitter")) return p;
    } else if (id.startsWith(p)) {
      return p;
    }
  }
  return null;
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

export const handler: Handler = async (event) => {
  const key = process.env.POSTIZ_API_KEY;
  const base = (process.env.POSTIZ_API_URL ?? DEFAULT_BASE).replace(/\/$/, "");
  const action = event.queryStringParameters?.action ?? "post";

  // Not configured: respond cleanly so the UI can fall back to copy/paste.
  if (!key) {
    if (action === "status") return json({ configured: false, accounts: [] });
    return json({ configured: false, published: false });
  }

  const headers = { Authorization: key, "Content-Type": "application/json" };

  async function listIntegrations(): Promise<Integration[]> {
    const r = await fetch(`${base}/integrations`, { headers });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    return Array.isArray(data) ? data : (data?.integrations ?? []);
  }

  if (action === "status") {
    try {
      const integrations = await listIntegrations();
      const connected = new Set<string>();
      const channels: { platform: string | null; name: string }[] = [];
      for (const it of integrations) {
        if (it.disabled) continue;
        const platform = resolvePlatform(it);
        if (platform) connected.add(platform);
        channels.push({ platform, name: it.name ?? "" });
      }
      return json({ configured: true, accounts: [...connected], channels });
    } catch (err) {
      return json({ configured: true, accounts: [], error: errMsg(err) });
    }
  }

  if (action === "post") {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Use POST" };
    let payload: {
      platform?: string;
      content?: string;
      image?: unknown[];
      scheduleDate?: string;
    };
    try {
      payload = JSON.parse(event.body ?? "{}");
    } catch {
      return json({ published: false, error: "Bad JSON body." }, 400);
    }
    const { platform, content, image, scheduleDate } = payload;
    if (!platform || !content) {
      return json({ published: false, error: "Missing platform or content." }, 400);
    }

    let integrations: Integration[];
    try {
      integrations = await listIntegrations();
    } catch (err) {
      return json({ configured: true, published: false, error: errMsg(err) });
    }
    const match = integrations.find(
      (it) => !it.disabled && resolvePlatform(it) === platform,
    );
    if (!match) {
      return json({
        configured: true,
        published: false,
        error: `No ${platform} channel is connected in Postiz.`,
      });
    }

    const __type =
      match.identifier ?? match.providerIdentifier ?? match.provider ?? platform;
    const body = {
      type: scheduleDate ? "schedule" : "now",
      date: scheduleDate ?? new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: match.id },
          value: [{ content, image: Array.isArray(image) ? image : [] }],
          settings: { __type },
        },
      ],
    };

    try {
      const r = await fetch(`${base}/posts`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      // Postiz returns the created post(s); shapes vary, so probe for an id.
      const id =
        (Array.isArray(data) && data[0]?.id) ||
        data?.id ||
        data?.posts?.[0]?.id ||
        null;
      return json({
        configured: true,
        ok: r.ok,
        scheduled: !!scheduleDate,
        id,
        raw: data,
      });
    } catch (err) {
      return json({ configured: true, published: false, error: errMsg(err) });
    }
  }

  if (action === "cancel") {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Use POST" };
    let id: string | undefined;
    try {
      id = JSON.parse(event.body ?? "{}").id;
    } catch {
      return json({ ok: false, error: "Bad JSON body." }, 400);
    }
    if (!id) return json({ ok: false, error: "Missing id." }, 400);
    try {
      const r = await fetch(`${base}/posts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      return json({ ok: r.ok });
    } catch (err) {
      return json({ ok: false, error: errMsg(err) });
    }
  }

  return { statusCode: 400, body: "Unknown action" };
};
