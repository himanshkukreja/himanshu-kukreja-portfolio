import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * User-scoped gate for /api/learn/*. The browser keeps the Supabase session in localStorage and
 * sends its access token as `Authorization: Bearer <jwt>` (see components/learn/progress/userFetch).
 * The user id always comes from the verified token, never from the request body.
 */
export type Learner = { id: string; email: string | null };

export async function getLearner(request: Request): Promise<Learner | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

/** `const me = await requireLearner(req); if (me instanceof NextResponse) return me;` */
export async function requireLearner(request: Request): Promise<Learner | NextResponse> {
  const me = await getLearner(request);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return me;
}

export const noStore = { "Cache-Control": "no-store" };

type PgError = { code?: string; message?: string; details?: string | null } | null;

/** Missing table/column: the level-up migration isn't applied yet. */
export function isMissing(error: PgError): boolean {
  if (!error) return false;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code || "")) return true;
  return /does not exist|could not find the/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}
