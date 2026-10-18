import "server-only";
/** Shared bits for /api/learn/design-week/* and /api/admin/design-week/*. Server-only. */
import { NextResponse } from "next/server";
import { getLearner, type Learner } from "@/app/api/learn/_lib/auth";
import { requireAdmin, type AdminUser } from "@/lib/admin/auth";
import { DowError, RATES, RateLimiter } from "./core";
import { dowFixtures } from "./store";

export const NO_STORE = { "Cache-Control": "no-store" };
export const PREVIEW_HEADER = "x-hk-admin-preview";

/** Signed-in learner (verified access token). Dev fixtures also accept `Bearer fixture.fx-…`. */
export async function dowLearner(req: Request): Promise<Learner | null> {
  if (dowFixtures()) {
    const m = (req.headers.get("authorization") || "").match(/^Bearer fixture\.(fx-[a-z0-9-]{1,30})$/);
    if (m) return { id: m[1], email: null };
  }
  return getLearner(req);
}

export async function requireDowLearner(req: Request): Promise<Learner> {
  const me = await dowLearner(req);
  if (!me) throw new DowError(401, "unauthorized", "Sign in to take part.");
  return me;
}

/**
 * requireAdmin, plus ONE dev-only escape hatch for `/admin?preview=1`: NODE_ENV=development AND
 * DOW_FIXTURES=1 AND the preview header → a preview admin that only ever touches the in-memory
 * fixture store. Production never takes it.
 */
export async function requireDowAdmin(req: Request): Promise<AdminUser | NextResponse> {
  if (process.env.NODE_ENV === "development" && dowFixtures() && req.headers.get(PREVIEW_HEADER) === "1") return { id: "preview", email: "preview@localhost" };
  return requireAdmin(req);
}

const limiters: Partial<Record<keyof typeof RATES, RateLimiter>> = {};

/** Best-effort per-instance rate limit (the database enforces the hard rules). */
export function rateLimit(kind: keyof typeof RATES, key: string) {
  const l = (limiters[kind] ||= new RateLimiter(RATES[kind].limit, RATES[kind].windowMs));
  if (!l.hit(key)) throw new DowError(429, "rate", "Slow down a little and try again in a minute.");
}

export function dowError(e: unknown): NextResponse {
  if (e instanceof DowError) {
    return NextResponse.json({ error: e.message, code: e.code, ...(e.fields ? { fields: e.fields } : {}) }, { status: e.status, headers: NO_STORE });
  }
  console.error("[design-week]", e);
  return NextResponse.json({ error: "Something went wrong. Try again.", code: "error" }, { status: 500, headers: NO_STORE });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Writes are JSON with a Bearer token (never cookies), so there is no ambient credential to forge. */
export function guardWrite(req: Request) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) throw new DowError(415, "invalid", "Send JSON.");
}
