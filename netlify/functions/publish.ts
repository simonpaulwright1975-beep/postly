import type { Handler } from "@netlify/functions";

/**
 * Aggregator publishing via Ayrshare. The API key lives ONLY in this
 * server-side function (AYRSHARE_API_KEY) — never shipped to the browser.
 * The frontend talks to /api/publish; this function proxies to Ayrshare so
 * one key posts to every connected social account.
 *
 * Actions:
 *   ?action=status  GET   → which accounts are connected
 *   ?action=post    POST  → publish now or schedule (scheduleDate)
 *   ?action=cancel  POST  → delete/unschedule a post by Ayrshare id
 */
const AYRSHARE_BASE = "https://api.ayrshare.com/api";

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
  const key = process.env.AYRSHARE_API_KEY;
  const action = event.queryStringParameters?.action ?? "post";

  // Not configured: respond cleanly so the UI can fall back to copy/paste
  // and the Channels page can explain how to connect.
  if (!key) {
    if (action === "status") return json({ configured: false, accounts: [] });
    return json({ configured: false, published: false });
  }

  const auth = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  if (action === "status") {
    try {
      const r = await fetch(`${AYRSHARE_BASE}/user`, { headers: auth });
      if (!r.ok) {
        return json({ configured: true, accounts: [], error: await r.text() });
      }
      const data = (await r.json()) as {
        activeSocialAccounts?: string[];
        displayNames?: { platform: string; displayName?: string }[];
      };
      return json({
        configured: true,
        accounts: data.activeSocialAccounts ?? [],
        displayNames: data.displayNames ?? [],
      });
    } catch (err) {
      return json({ configured: true, accounts: [], error: errMsg(err) });
    }
  }

  if (action === "post") {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Use POST" };
    let payload: {
      post?: string;
      platforms?: string[];
      mediaUrls?: string[];
      scheduleDate?: string;
    };
    try {
      payload = JSON.parse(event.body ?? "{}");
    } catch {
      return json({ published: false, error: "Bad JSON body." }, 400);
    }
    const { post, platforms, mediaUrls, scheduleDate } = payload;
    if (!post || !Array.isArray(platforms) || platforms.length === 0) {
      return json({ published: false, error: "Missing post text or platforms." }, 400);
    }
    const body: Record<string, unknown> = { post, platforms };
    if (Array.isArray(mediaUrls) && mediaUrls.length) body.mediaUrls = mediaUrls;
    if (scheduleDate) body.scheduleDate = scheduleDate;
    try {
      const r = await fetch(`${AYRSHARE_BASE}/post`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify(body),
      });
      // Ayrshare: { status: "success"|"scheduled"|"error", id, postIds, errors }
      const data = (await r.json()) as Record<string, unknown>;
      return json({ configured: true, ok: r.ok, ...data });
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
      const r = await fetch(`${AYRSHARE_BASE}/post`, {
        method: "DELETE",
        headers: auth,
        body: JSON.stringify({ id }),
      });
      const data = (await r.json()) as Record<string, unknown>;
      return json({ ok: r.ok, ...data });
    } catch (err) {
      return json({ ok: false, error: errMsg(err) });
    }
  }

  return { statusCode: 400, body: "Unknown action" };
};
