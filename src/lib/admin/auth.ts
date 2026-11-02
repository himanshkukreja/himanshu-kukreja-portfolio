import "server-only";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { addedAdmins, isAdminEmail, isOwnerEmail } from "./admins";

/**
 * Server-side admin gate for /api/admin/*. The browser keeps the Supabase session in localStorage, so callers send
 * its access token as `Authorization: Bearer <jwt>` (see `adminFetch`). The token is verified (locally for reads, by
 * Supabase Auth for writes: see getAdmin) and the user's email must be an admin: an owner (OWNER_EMAIL, ADMIN_EMAIL)
 * or a row of admin_users (lib/admin/admins.ts).
 * Never trust a client-supplied email header.
 */
export type AdminUser = { id: string; email: string; /** may add and remove admins (dev stand-ins leave it out: never owners) */ owner?: boolean };

export { adminEmails, adminEmailsSync, isAdminEmail, isOwnerEmail, ownerEmails } from "./admins";

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Who sent this request, if they're an admin.
 *
 * Reads (GET/HEAD) verify the access token locally: Supabase `getClaims()` checks the signature against the
 * project's published signing key (JWKS, cached per instance) and the expiry, with no Auth round trip; a token signed
 * with the legacy shared secret falls back to `getUser()` inside getClaims. Writes (POST/PATCH/PUT/DELETE) always
 * ask Supabase Auth (`getUser`), so a signed-out or deleted session can't change anything. The admin list read
 * (admin_users, cached a minute per instance) starts alongside the token check instead of after it.
 */
export async function getAdmin(request: Request): Promise<AdminUser | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  void addedAdmins().catch(() => null);
  let id: string | null = null;
  let email: string | undefined;
  if (READS.has((request.method || "GET").toUpperCase())) {
    const { data, error } = await supabase.auth.getClaims(token).catch((e: Error) => ({ data: null, error: e }));
    const c = data?.claims as { sub?: string; email?: string; role?: string } | undefined;
    if (error || !c?.sub || c.role !== "authenticated") return null;
    id = c.sub;
    email = c.email?.toLowerCase();
  } else {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    id = data.user.id;
    email = data.user.email?.toLowerCase();
  }
  if (!id || !email || !(await isAdminEmail(email))) return null;
  return { id, email, owner: isOwnerEmail(email) };
}

/** `const admin = await requireAdmin(req); if (admin instanceof NextResponse) return admin;` */
export async function requireAdmin(request: Request): Promise<AdminUser | NextResponse> {
  const admin = await getAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return admin;
}

/** Owners only (adding and removing admins): 401 for non-admins, 403 for added admins. */
export async function requireOwner(request: Request): Promise<AdminUser | NextResponse> {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  if (!admin.owner) return NextResponse.json({ error: "Only the owner can manage admins." }, { status: 403 });
  return admin;
}
