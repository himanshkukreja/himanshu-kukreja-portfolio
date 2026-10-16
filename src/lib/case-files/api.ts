/** Auth + error mapping for /api/admin/case-files/*. Server-only. */
import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin, type AdminUser } from "@/lib/admin/auth";
import { TablesMissingError } from "./store";
import { PREVIEW_HEADER } from "./types";

/**
 * requireAdmin, plus ONE dev-only escape hatch for the `/admin?preview=1` fixture mode: with
 * NODE_ENV=development AND the local JSON store switched on (CASE_FILES_STORE=file), a request
 * carrying `x-hk-admin-preview: 1` acts as a preview admin. Production builds never take it
 * (NODE_ENV is "production"), and it only ever touches the local JSON file.
 */
export async function requireCaseFilesAdmin(req: Request): Promise<AdminUser | NextResponse> {
  if (process.env.NODE_ENV === "development" && process.env.CASE_FILES_STORE === "file" && process.env.CASE_FILES_STORE_FILE && req.headers.get(PREVIEW_HEADER) === "1") {
    return { id: "preview", email: "preview@localhost" };
  }
  return requireAdmin(req);
}

export function cfError(e: unknown): NextResponse {
  if (e instanceof TablesMissingError) return NextResponse.json({ error: e.message, code: "tables-missing", missing: e.missing }, { status: 503 });
  const err = e as Error & { status?: number; code?: string; validation?: unknown; id?: string; version?: number };
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status === 500) console.error("[case-files]", err);
  return NextResponse.json(
    {
      error: status === 500 ? "Something went wrong saving the case file." : err?.message || "Request failed",
      ...(err?.code ? { code: err.code } : {}),
      ...(err?.validation ? { validation: err.validation } : {}),
      ...(err?.id ? { id: err.id } : {}),
      ...(typeof err?.version === "number" ? { version: err.version } : {}),
    },
    { status }
  );
}

export const originOf = (req: Request) => {
  try {
    return new URL(req.url).origin;
  } catch {
    return undefined;
  }
};

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const NO_STORE = { "Cache-Control": "no-store" };
