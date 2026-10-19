import "server-only";
/**
 * Request helpers for the certificate APIs: the signed-in learner (verified Bearer token, the same
 * gate as /api/learn/*), the admin gate, and error → JSON.
 *
 * Dev QA (NODE_ENV !== "production" AND CERT_FIXTURES=1): `Bearer fixture.<id>` signs in a fixture
 * learner, and in development the `x-hk-admin-preview: 1` header (sent by /admin?preview=1) acts as
 * a preview admin against the in-memory fixture store. Production never takes either branch.
 */
import { NextResponse } from "next/server";
import { getLearner, type Learner } from "@/app/api/learn/_lib/auth";
import { requireAdmin, type AdminUser } from "@/lib/admin/auth";
import { certFixtures } from "./store";
import { CertError } from "./service";

export const NO_STORE = { "Cache-Control": "no-store" };
export const PREVIEW_HEADER = "x-hk-admin-preview";

export async function certLearner(req: Request): Promise<Learner | null> {
  if (certFixtures()) {
    const m = (req.headers.get("authorization") || "").match(/^Bearer fixture\.([a-z0-9-]{2,40})$/);
    if (m) return { id: m[1], email: null };
  }
  return getLearner(req);
}

export async function requireCertLearner(req: Request): Promise<Learner | NextResponse> {
  const me = await certLearner(req);
  if (!me) return NextResponse.json({ error: "Sign in to earn certificates." }, { status: 401, headers: NO_STORE });
  return me;
}

export async function requireCertAdmin(req: Request): Promise<AdminUser | NextResponse> {
  if (process.env.NODE_ENV === "development" && certFixtures() && req.headers.get(PREVIEW_HEADER) === "1") return { id: "preview", email: "preview@localhost" };
  return requireAdmin(req);
}

export function certErrorResponse(e: unknown): NextResponse {
  if (e instanceof CertError) return NextResponse.json({ error: e.message, code: e.code, ...(e.extra || {}) }, { status: e.status, headers: NO_STORE });
  console.error("[certificates]", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500, headers: NO_STORE });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text().catch(() => "");
  if (text.length > 10_000) throw new CertError(413, "Request too large.");
  try {
    const v = text ? JSON.parse(text) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new CertError(400, "Invalid JSON.");
  }
}
