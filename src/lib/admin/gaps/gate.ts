import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin, type AdminUser } from "@/lib/admin/auth";
import { shareFixtures } from "@/lib/share/store";
import { gapFixtures } from "./sources/fixtures";

/** sent by /admin?preview=1 (dev only) */
export const PREVIEW_HEADER = "x-hk-admin-preview";

/**
 * The admin gate for /api/admin/gaps and /api/admin/shares. In `next dev` with GAPS_FIXTURES=1 or
 * SHARE_FIXTURES=1, the preview header stands in for an admin (sample data only). Never in production.
 */
export async function requireGapsAdmin(req: Request): Promise<AdminUser | NextResponse> {
  if (process.env.NODE_ENV === "development" && (gapFixtures() || shareFixtures()) && req.headers.get(PREVIEW_HEADER) === "1") return { id: "preview", email: "preview@localhost" };
  return requireAdmin(req);
}
