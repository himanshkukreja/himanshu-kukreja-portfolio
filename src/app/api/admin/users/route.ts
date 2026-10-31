import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type AdminUserRow = {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  lastSeenAt: string | null;
  confirmed: boolean;
  providers: string[];
  lessonsCompleted: number | null;
  currentStreak: number | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  last_seen_at: string | null;
  total_lessons_completed: number | null;
  current_streak: number | null;
};

async function allAuthUsers(): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}

/**
 * GET /api/admin/users → { users: AdminUserRow[], total }
 * Auth users (email, provider, sign-in times) joined with user_profiles (name, avatar, counters).
 * Learning stats live in /admin/learners.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const [authUsers, profilesRes] = await Promise.all([
      allAuthUsers(),
      supabase.from("user_profiles").select("id, full_name, avatar_url, last_seen_at, total_lessons_completed, current_streak"),
    ]);
    const profiles = new Map<string, Profile>(((profilesRes.data as Profile[] | null) || []).map((p) => [p.id, p]));

    const users: AdminUserRow[] = authUsers
      .map((u) => {
        const p = profiles.get(u.id);
        const meta = (u.user_metadata || {}) as Record<string, unknown>;
        const providers = Array.isArray(u.app_metadata?.providers)
          ? (u.app_metadata.providers as string[])
          : u.app_metadata?.provider
            ? [String(u.app_metadata.provider)]
            : [];
        return {
          id: u.id,
          email: u.email ?? null,
          name: p?.full_name || (typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null),
          avatar: p ? p.avatar_url : typeof meta.avatar_url === "string" ? meta.avatar_url : null, // profile null = initials chosen
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
          lastSeenAt: p?.last_seen_at ?? null,
          confirmed: !!(u.email_confirmed_at || u.confirmed_at),
          providers,
          lessonsCompleted: p?.total_lessons_completed ?? null,
          currentStreak: p?.current_streak ?? null,
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return NextResponse.json({ users, total: users.length });
  } catch (error) {
    console.error("[admin/users]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
