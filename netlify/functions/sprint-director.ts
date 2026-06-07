// /api/sprint-director
//   POST {pin}                         → validate PIN server-side, mint token
//   GET  (Authorization: Bearer token) → director business / self-funding figures
//
// Business figures are computed and returned ONLY after the token verifies, so
// they are never shipped to an unauthenticated client (unlike the prototype's
// client-side PIN gate where the numbers sat in the page source).

import type { Handler } from "@netlify/functions";
import { buildDirectorFigures } from "./_shared/calc";
import { getSales, getSalespeople, getSettings } from "./_shared/db";
import {
  bearer,
  checkPin,
  issueToken,
  verifyToken,
} from "./_shared/auth";
import {
  badRequest,
  methodNotAllowed,
  ok,
  parseBody,
  serverError,
  unauthorized,
} from "./_shared/http";

interface LoginBody {
  pin?: string;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === "POST") {
      const { pin } = parseBody<LoginBody>(event.body);
      if (!pin) return badRequest("A PIN is required.");
      if (!checkPin(pin)) return unauthorized("Incorrect PIN.");
      return ok(issueToken());
    }

    if (event.httpMethod === "GET") {
      const token = bearer(event.headers as Record<string, string | undefined>);
      if (!verifyToken(token)) return unauthorized("Director login required.");

      const [people, sales, settings] = await Promise.all([
        getSalespeople(),
        getSales(),
        getSettings(),
      ]);
      return ok(buildDirectorFigures(people, sales, settings.costPerCase));
    }

    return methodNotAllowed();
  } catch (err) {
    return serverError(err);
  }
};
