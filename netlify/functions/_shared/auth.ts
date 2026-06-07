// Server-side Director authentication.
//
// The PIN is validated on the server and never embedded in any client bundle.
// On success we mint a short-lived, HMAC-signed token; the director figures
// endpoint only computes and returns business numbers when the token verifies.
// No business figures are ever sent to an unauthenticated client.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Director PIN — overridable via env; defaults to the brief's credential. */
function directorPin(): string {
  return process.env.DIRECTOR_PIN ?? "01237470990";
}

/** Secret used to sign tokens. Falls back to the PIN so it works out of the box. */
function tokenSecret(): string {
  return process.env.DIRECTOR_TOKEN_SECRET ?? directorPin() ?? "toilet-roll-sprint";
}

const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 hours

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", tokenSecret()).update(payload).digest());
}

/** Constant-time string comparison that won't throw on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True when the supplied PIN matches the director credential. */
export function checkPin(pin: string): boolean {
  return safeEqual(String(pin ?? "").trim(), directorPin());
}

/** Mint a signed director token valid for {@link TOKEN_TTL_SECONDS}. */
export function issueToken(): { token: string; expiresIn: number } {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = b64url(Buffer.from(JSON.stringify({ role: "director", exp })));
  const token = `${payload}.${sign(payload)}`;
  return { token, expiresIn: TOKEN_TTL_SECONDS };
}

/** Verify a director token's signature and expiry. */
export function verifyToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return data.role === "director" && typeof data.exp === "number" && data.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

/** Extract a bearer token from an Authorization header. */
export function bearer(headers: Record<string, string | undefined>): string | null {
  const h = headers.authorization ?? headers.Authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}
