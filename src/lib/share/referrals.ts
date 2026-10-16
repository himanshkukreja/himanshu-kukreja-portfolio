import "server-only";
/**
 * Referral attribution for shared progress links (table `referrals`, service role only):
 *   1. a visitor lands on /u/<handle> or any link carrying ?ref=<handle> → one row per
 *      (referrer, visitor id): first_seen_at
 *   2. that browser signs in → the row gets referred_user_id + signed_up_at (only for accounts
 *      created after the first visit, never the referrer themself, one referrer per account)
 *   3. first_lesson_started_at / first_lesson_at are filled from learning_progress when the admin
 *      card loads (so the lesson flow doesn't need to know about referrals)
 */
import { supabase } from "@/lib/supabase";
import { COURSE_ID } from "@/lib/learn/course";
import { fxStore, isMissing, settingsForHandle, shareFixtures } from "./store";

export type ReferralRow = {
  id?: string;
  referrer_user_id: string;
  referred_user_id: string | null;
  ref_handle: string;
  visitor_id: string | null;
  landing_path: string | null;
  channel: string | null;
  first_seen_at: string;
  signed_up_at: string | null;
  first_lesson_started_at: string | null;
  first_lesson_at: string | null;
};

const VID = /^[A-Za-z0-9_-]{6,64}$/;
const CHANNELS = new Set(["whatsapp", "linkedin", "x", "copy", "native", "direct"]);

export async function recordVisit(input: { handle: string; visitorId: string; path?: string; channel?: string; viewerId?: string | null }): Promise<"recorded" | "seen" | "ignored"> {
  if (!VID.test(input.visitorId)) return "ignored";
  const owner = await settingsForHandle(input.handle);
  if (!owner || !owner.settings.enabled) return "ignored";
  if (input.viewerId && input.viewerId === owner.userId) return "ignored"; // the sharer looking at their own page
  const row: ReferralRow = {
    referrer_user_id: owner.userId,
    referred_user_id: null,
    ref_handle: input.handle,
    visitor_id: input.visitorId,
    landing_path: (input.path || "").slice(0, 200) || null,
    channel: input.channel && CHANNELS.has(input.channel) ? input.channel : null,
    first_seen_at: new Date().toISOString(),
    signed_up_at: null,
    first_lesson_started_at: null,
    first_lesson_at: null,
  };
  if (shareFixtures()) {
    const list = fxStore().referrals as ReferralRow[];
    if (list.some((r) => r.referrer_user_id === row.referrer_user_id && r.visitor_id === row.visitor_id)) return "seen";
    list.push({ ...row, id: `fx-${list.length + 1}` });
    return "recorded";
  }
  const { error } = await supabase.from("referrals").insert(row);
  if (!error) return "recorded";
  if (error.code === "23505") return "seen";
  if (isMissing(error)) return "ignored";
  throw new Error(error.message);
}

async function accountCreatedAt(userId: string): Promise<number | null> {
  if (shareFixtures() && userId.startsWith("fx-")) return Date.now();
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const t = data?.user?.created_at ? Date.parse(data.user.created_at) : NaN;
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/** Grace for clock skew / a visit recorded a moment after the sign-up finished. */
const SIGNUP_GRACE_MS = 10 * 60_000;

export async function claimReferral(input: { userId: string; handle: string; visitorId: string | null; firstSeenAt: number | null }): Promise<"claimed" | "already" | "not-new" | "self" | "ignored"> {
  const owner = await settingsForHandle(input.handle);
  if (!owner) return "ignored";
  if (owner.userId === input.userId) return "self";
  const created = await accountCreatedAt(input.userId);
  const seen = input.firstSeenAt && Number.isFinite(input.firstSeenAt) ? input.firstSeenAt : null;
  // only accounts created after the visitor first arrived through the link count as referred sign-ups
  if (!created || (seen && created < seen - SIGNUP_GRACE_MS)) return "not-new";
  const now = new Date().toISOString();
  const signedUp = new Date(created).toISOString();

  if (shareFixtures()) {
    const list = fxStore().referrals as ReferralRow[];
    if (list.some((r) => r.referred_user_id === input.userId)) return "already";
    const hit = list.find((r) => r.referrer_user_id === owner.userId && r.visitor_id && r.visitor_id === input.visitorId && !r.referred_user_id);
    if (hit) Object.assign(hit, { referred_user_id: input.userId, signed_up_at: signedUp });
    else list.push({ id: `fx-${list.length + 1}`, referrer_user_id: owner.userId, referred_user_id: input.userId, ref_handle: input.handle, visitor_id: input.visitorId, landing_path: null, channel: null, first_seen_at: seen ? new Date(seen).toISOString() : now, signed_up_at: signedUp, first_lesson_started_at: null, first_lesson_at: null });
    return "claimed";
  }

  const mine = await supabase.from("referrals").select("id").eq("referred_user_id", input.userId).limit(1);
  if (mine.error) {
    if (isMissing(mine.error)) return "ignored";
    throw new Error(mine.error.message);
  }
  if ((mine.data || []).length) return "already";
  if (input.visitorId && VID.test(input.visitorId)) {
    const upd = await supabase
      .from("referrals")
      .update({ referred_user_id: input.userId, signed_up_at: signedUp })
      .eq("referrer_user_id", owner.userId)
      .eq("visitor_id", input.visitorId)
      .is("referred_user_id", null)
      .select("id");
    if (!upd.error && (upd.data || []).length) return "claimed";
    if (upd.error?.code === "23505") return "already";
  }
  const ins = await supabase.from("referrals").insert({
    referrer_user_id: owner.userId,
    referred_user_id: input.userId,
    ref_handle: input.handle,
    visitor_id: input.visitorId && VID.test(input.visitorId) ? input.visitorId : null,
    first_seen_at: seen ? new Date(seen).toISOString() : now,
    signed_up_at: signedUp,
  });
  if (ins.error) {
    if (ins.error.code === "23505") return "already";
    if (isMissing(ins.error)) return "ignored";
    throw new Error(ins.error.message);
  }
  return "claimed";
}

/* ------------------------------------------------------------------ admin summary */

export type ReferralSummary = {
  available: boolean;
  range: { from: string; to: string };
  sharers: number;
  visits: number;
  signups: number;
  started: number;
  finished: number;
  conversion: number | null;
  top: { handle: string; visits: number; signups: number; started: number; finished: number; shares: number }[];
  recent: { handle: string; at: string; stage: "visit" | "signup" | "started" | "finished" }[];
};

const RANGE_DAYS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

async function backfillLessons(rows: ReferralRow[]) {
  const need = rows.filter((r) => r.referred_user_id && (!r.first_lesson_started_at || !r.first_lesson_at));
  if (!need.length || shareFixtures()) return;
  const ids = [...new Set(need.map((r) => r.referred_user_id!))].slice(0, 500);
  const { data } = await supabase.from("learning_progress").select("user_id, status, started_at, created_at, completed_at").eq("course_id", COURSE_ID).in("user_id", ids).limit(5000);
  const first = new Map<string, { start: number; done: number }>();
  ((data || []) as { user_id: string; status: string | null; started_at: string | null; created_at: string | null; completed_at: string | null }[]).forEach((p) => {
    const f = first.get(p.user_id) || { start: Infinity, done: Infinity };
    const s = Date.parse(p.started_at || p.created_at || "");
    if (Number.isFinite(s)) f.start = Math.min(f.start, s);
    const c = p.status === "completed" ? Date.parse(p.completed_at || "") : NaN;
    if (Number.isFinite(c)) f.done = Math.min(f.done, c);
    first.set(p.user_id, f);
  });
  for (const r of need) {
    const f = first.get(r.referred_user_id!);
    if (!f) continue;
    const patch: Partial<ReferralRow> = {};
    if (!r.first_lesson_started_at && Number.isFinite(f.start)) patch.first_lesson_started_at = new Date(f.start).toISOString();
    if (!r.first_lesson_at && Number.isFinite(f.done)) patch.first_lesson_at = new Date(f.done).toISOString();
    if (!Object.keys(patch).length) continue;
    Object.assign(r, patch);
    if (r.id) await supabase.from("referrals").update(patch).eq("id", r.id);
  }
}

export async function referralSummary(range: string): Promise<ReferralSummary> {
  const days = RANGE_DAYS[range] || 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const empty: ReferralSummary = { available: false, range: { from: from.toISOString(), to: to.toISOString() }, sharers: 0, visits: 0, signups: 0, started: 0, finished: 0, conversion: null, top: [], recent: [] };

  let rows: ReferralRow[] = [];
  let sharers = 0;
  if (shareFixtures()) {
    rows = (fxStore().referrals as ReferralRow[]).filter((r) => Date.parse(r.first_seen_at) >= from.getTime());
    sharers = [...fxStore().settings.values()].filter((s) => s.enabled).length;
  } else {
    const res = await supabase.from("referrals").select("*").gte("first_seen_at", from.toISOString()).order("first_seen_at", { ascending: false }).limit(5000);
    if (res.error) {
      if (isMissing(res.error)) return empty;
      throw new Error(res.error.message);
    }
    rows = (res.data || []) as ReferralRow[];
    const sh = await supabase.from("share_profiles").select("user_id", { count: "exact", head: true }).eq("enabled", true);
    sharers = sh.count || 0;
    await backfillLessons(rows).catch(() => {});
  }

  // share button presses (analytics events, signed-in sharers) per user in range
  const shares = new Map<string, number>();
  if (!shareFixtures()) {
    const ev = await supabase
      .from("analytics_events")
      .select("user_id")
      .eq("event_type", "event")
      .eq("metadata->>name", "share_progress")
      .not("user_id", "is", null)
      .gte("created_at", from.toISOString())
      .limit(5000);
    ((ev.data || []) as { user_id: string }[]).forEach((e) => shares.set(e.user_id, (shares.get(e.user_id) || 0) + 1));
  }

  const by = new Map<string, ReferralSummary["top"][number] & { uid: string }>();
  for (const r of rows) {
    const t = by.get(r.referrer_user_id) || { uid: r.referrer_user_id, handle: r.ref_handle, visits: 0, signups: 0, started: 0, finished: 0, shares: shares.get(r.referrer_user_id) || 0 };
    t.handle = t.handle || r.ref_handle;
    if (r.visitor_id) t.visits++;
    if (r.referred_user_id) t.signups++;
    if (r.first_lesson_started_at) t.started++;
    if (r.first_lesson_at) t.finished++;
    by.set(r.referrer_user_id, t);
  }
  const top = [...by.values()]
    .sort((a, b) => b.signups - a.signups || b.visits - a.visits)
    .slice(0, 10)
    .map((t) => ({ handle: t.handle, visits: t.visits, signups: t.signups, started: t.started, finished: t.finished, shares: t.shares }));
  const visits = rows.filter((r) => r.visitor_id).length;
  const signups = rows.filter((r) => r.referred_user_id).length;
  const recent = rows
    .flatMap((r) => [
      { handle: r.ref_handle, at: r.first_seen_at, stage: "visit" as const },
      ...(r.signed_up_at ? [{ handle: r.ref_handle, at: r.signed_up_at, stage: "signup" as const }] : []),
      ...(r.first_lesson_at ? [{ handle: r.ref_handle, at: r.first_lesson_at, stage: "finished" as const }] : []),
    ])
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 8);
  return {
    available: true,
    range: empty.range,
    sharers,
    visits,
    signups,
    started: rows.filter((r) => r.first_lesson_started_at).length,
    finished: rows.filter((r) => r.first_lesson_at).length,
    conversion: visits ? signups / visits : null,
    top,
    recent,
  };
}
