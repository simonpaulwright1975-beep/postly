import type { Handler } from "@netlify/functions";
import { JWT } from "google-auth-library";

// Maps a media category to the env var holding its Google Drive folder ID.
const FOLDER_ENV: Record<string, string> = {
  inspiration: "DRIVE_FOLDER_INSPIRATION_ID",
  new: "DRIVE_FOLDER_NEW_ID",
  stock: "DRIVE_FOLDER_STOCK_ID",
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

function getClient(): JWT | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const creds = JSON.parse(raw) as { client_email: string; private_key: string };
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

function json(body: unknown) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  const action = event.queryStringParameters?.action ?? "list";
  const client = getClient();

  if (!client) {
    // Browsing degrades gracefully to a "connect Drive" empty state.
    if (action === "list") return json({ configured: false, images: [] });
    return { statusCode: 501, body: "Google Drive is not configured on the server." };
  }

  let accessToken: string;
  try {
    const t = await client.getAccessToken();
    if (!t.token) throw new Error("No access token");
    accessToken = t.token;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "auth error";
    return { statusCode: 502, body: `Google auth failed: ${msg}` };
  }
  const auth = { Authorization: `Bearer ${accessToken}` };

  if (action === "list") {
    const category = event.queryStringParameters?.category ?? "new";
    const folderId = process.env[FOLDER_ENV[category]];
    if (!folderId) return json({ configured: false, images: [] });

    const q = encodeURIComponent(
      `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
    );
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${q}` +
      `&fields=files(id,name,mimeType)&pageSize=200&orderBy=createdTime desc`;
    const r = await fetch(url, { headers: auth });
    if (!r.ok) return { statusCode: 502, body: `Drive list failed: ${await r.text()}` };

    const data = (await r.json()) as { files?: DriveFile[] };
    const images = (data.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      category,
      thumbnailUrl: `/api/drive?action=file&id=${f.id}`,
      fullUrl: `/api/drive?action=file&id=${f.id}`,
    }));
    return json({ configured: true, images });
  }

  if (action === "file") {
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode: 400, body: "Missing id" };
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`,
      { headers: auth },
    );
    if (!r.ok) return { statusCode: 502, body: `Drive fetch failed: ${await r.text()}` };
    const buf = Buffer.from(await r.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        "Content-Type": r.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  }

  return { statusCode: 400, body: "Unknown action" };
};
