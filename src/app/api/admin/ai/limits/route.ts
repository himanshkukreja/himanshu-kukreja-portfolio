import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { getAiSettings } from "@/lib/ai/settings";
import { getBudget } from "@/lib/ai/governor";
import { invalidateUserLimits, userLimits } from "@/lib/ai/limits";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** Find an account by email (the auth admin API has no lookup by email: page through, small user base). */
async function userIdForEmail(email: string): Promise<string | null> {
  const want = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = data.users.find((u) => (u.email || "").toLowerCase() === want);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** GET → { shared: { credits, ceiling }, limits: [{ userId, email, dailyCredits, note, updatedAt, updatedBy }] } */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const [map, s] = await Promise.all([userLimits(true), getAiSettings()]);
  const b = await getBudget(s);
  const limits = await Promise.all(
    [...map.values()].map(async (l) => {
      const { data } = await supabase.auth.admin.getUserById(l.userId).catch(() => ({ data: null }));
      return { ...l, email: data?.user?.email ?? null };
    })
  );
  limits.sort((a, b2) => (a.email || a.userId).localeCompare(b2.email || b2.userId));
  return NextResponse.json({ shared: { credits: b.userDailyCredits, ceiling: Math.floor(s.userDailyMaxUsd / 0.001) }, limits });
}

/** POST { email | userId, dailyCredits, note? } → sets (or replaces) one learner's daily credits. */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const b = (await request.json().catch(() => ({}))) as { email?: string; userId?: string; dailyCredits?: number; note?: string };
  const credits = Math.floor(Number(b.dailyCredits));
  if (!Number.isFinite(credits) || credits < 0 || credits > 1_000_000) return NextResponse.json({ error: "Daily credits must be a whole number from 0 to 1,000,000." }, { status: 400 });
  let userId = b.userId && UUID.test(b.userId) ? b.userId : null;
  if (!userId && b.email) userId = await userIdForEmail(b.email);
  if (!userId) return NextResponse.json({ error: b.email ? `No account with the email ${b.email}.` : "Give an email or a user id." }, { status: 404 });
  const { error } = await supabase
    .from("ai_user_limits")
    .upsert({ user_id: userId, daily_credits: credits, note: (b.note || "").trim().slice(0, 200) || null, updated_at: new Date().toISOString(), updated_by: admin.email });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateUserLimits();
  return NextResponse.json({ ok: true, userId, dailyCredits: credits });
}

/** DELETE ?userId= → back to the shared allowance. */
export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const userId = new URL(request.url).searchParams.get("userId") || "";
  if (!UUID.test(userId)) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const { error } = await supabase.from("ai_user_limits").delete().eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateUserLimits();
  return NextResponse.json({ ok: true });
}
