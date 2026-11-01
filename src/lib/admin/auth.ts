import "server-only";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isAdminEmail, isOwnerEmail } from "./admins";

/**
 * Server-side admin gate for /api/admin/*. The browser keeps the Supabase session in localStorage, so callers send
 * its access token as `Authorization: Bearer <jwt>` (see `adminFetch`). The token is verified with Supabase and the
 * user's email must be an admin: an owner (OWNER_EMAIL, ADMIN_EMAIL) or a row of admin_users (lib/admin/admins.ts).
 * Never trust a client-supplied email header.
 */
export type AdminUser = { id: string; email: string; /** may add and remove admins (dev stand-ins leave it out: never owners) */ owner?: boolean };

export { adminEmails, adminEmailsSync, isAdminEmail, isOwnerEmail, ownerEmails } from "./admins";

export async function getAdmin(request: Request): Promise<AdminUser | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !data?.user || !email || !(await isAdminEmail(email))) return null;
  return { id: data.user.id, email, owner: isOwnerEmail(email) };
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
