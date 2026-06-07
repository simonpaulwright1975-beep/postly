// Small HTTP helpers shared by the Toilet Roll Sprint functions.

import type { HandlerResponse } from "@netlify/functions";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function json(statusCode: number, body: unknown): HandlerResponse {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function ok(body: unknown): HandlerResponse {
  return json(200, body);
}

export function badRequest(message: string): HandlerResponse {
  return json(400, { error: message });
}

export function unauthorized(message = "Not authorised"): HandlerResponse {
  return json(401, { error: message });
}

export function methodNotAllowed(): HandlerResponse {
  return json(405, { error: "Method not allowed" });
}

/** Turn any thrown error into a 500 with a safe message. */
export function serverError(err: unknown): HandlerResponse {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  return json(500, { error: message });
}

export function parseBody<T>(raw: string | null | undefined): T {
  return JSON.parse(raw ?? "{}") as T;
}
