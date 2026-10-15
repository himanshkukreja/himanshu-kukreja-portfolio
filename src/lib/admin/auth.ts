import "server-only";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Server-side admin gate for /api/admin/*. The browser keeps the Supabase session in
 * localStorage, so callers send its access token as `Authorization: Bearer <jwt>` (see
 * `adminFetch`). The token is verified with Supabase and the user's email must be in
 * ADMIN_EMAIL (comma-separated). Never trust a client-supplied email header.
 */
export type AdminUser = { id: string; email: string };

// The owner is always an admin, even when ADMIN_EMAIL is missing from a deployment's env;
// ADMIN_EMAIL (comma-separated) adds more.
const OWNER_EMAIL = "kukreja.him@gmail.com";

export const adminEmails = () =>
  [OWNER_EMAIL, ...(process.env.ADMIN_EMAIL || "").split(",")]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function getAdmin(request: Request): Promise<AdminUser | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !data?.user || !email || !adminEmails().includes(email)) return null;
  return { id: data.user.id, email };
}

/** `const admin = await requireAdmin(req); if (admin instanceof NextResponse) return admin;` */
export async function requireAdmin(request: Request): Promise<AdminUser | NextResponse> {
  const admin = await getAdmin(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return admin;
}
