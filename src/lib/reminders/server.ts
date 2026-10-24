/**
 * Opt-in learning reminders (server only). A learner switches them on from the Progress page; once a
 * day (pg_cron → /api/cron/reminders, 19:30 IST) everyone with a streak still running from yesterday
 * and nothing learned today gets one nudge, by push and/or email. Never more than one a day, and every
 * email carries a one-click unsubscribe link. Table: public.learner_reminders (20261025 migration).
 */
import "server-only";
import webpush, { type PushSubscription } from "web-push";
import { supabase } from "@/lib/supabase";
import { sendRawEmail } from "@/lib/mailer";
import { SITE_URL } from "@/lib/site";

export type ReminderPrefs = { emailOn: boolean; pushOn: boolean; pushDevices: number; tz: string };
type Row = { user_id: string; email_on: boolean; push_on: boolean; push_subs: PushSubscription[]; tz: string; last_sent_on: string | null; unsub_token: string };

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

function vapidReady(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(SITE_URL, pub, priv); // contact = the site, not an address (sent to push services)
  return true;
}

/** YYYY-MM-DD in a time zone (the learner's day, the way the browser records activity). */
export function dayIn(tz: string, d = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
}
const prevDay = (day: string, n = 1) => {
  const t = new Date(`${day}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
};

/** Streak still alive from yesterday but nothing today: how many days are at stake (0 = not at risk). */
export function atRisk(activeDays: Set<string>, today: string): number {
  if (activeDays.has(today)) return 0;
  let n = 0;
  for (let d = prevDay(today); activeDays.has(d); d = prevDay(d)) n++;
  return n;
}

const ok = (tz: unknown) => (typeof tz === "string" && tz.length <= 64 && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz) ? tz : "Asia/Kolkata");

export async function getPrefs(userId: string): Promise<ReminderPrefs> {
  const { data } = await supabase.from("learner_reminders").select("email_on, push_on, push_subs, tz").eq("user_id", userId).maybeSingle();
  const r = data as Pick<Row, "email_on" | "push_on" | "push_subs" | "tz"> | null;
  return { emailOn: !!r?.email_on, pushOn: !!r?.push_on, pushDevices: Array.isArray(r?.push_subs) ? r!.push_subs.length : 0, tz: r?.tz || "Asia/Kolkata" };
}

/** Partial update from the Progress page. A new push subscription is added (one per device endpoint). */
export async function savePrefs(userId: string, body: { emailOn?: unknown; pushOn?: unknown; subscription?: unknown; removeEndpoint?: unknown; tz?: unknown }): Promise<ReminderPrefs> {
  const { data } = await supabase.from("learner_reminders").select("push_subs").eq("user_id", userId).maybeSingle();
  let subs = (Array.isArray((data as Row | null)?.push_subs) ? (data as Row).push_subs : []) as PushSubscription[];
  const sub = body.subscription as PushSubscription | undefined;
  if (sub && typeof sub.endpoint === "string" && /^https:\/\//.test(sub.endpoint) && sub.keys?.p256dh && sub.keys?.auth) {
    subs = [...subs.filter((s) => s.endpoint !== sub.endpoint), { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }].slice(-5);
  }
  if (typeof body.removeEndpoint === "string") subs = subs.filter((s) => s.endpoint !== body.removeEndpoint);
  const patch: Record<string, unknown> = { user_id: userId, push_subs: subs, updated_at: new Date().toISOString() };
  if (typeof body.emailOn === "boolean") patch.email_on = body.emailOn;
  if (typeof body.pushOn === "boolean") patch.push_on = body.pushOn && subs.length > 0;
  if (body.tz !== undefined) patch.tz = ok(body.tz);
  const { error } = await supabase.from("learner_reminders").upsert(patch, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  return getPrefs(userId);
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const { data, error } = await supabase.from("learner_reminders").update({ email_on: false, updated_at: new Date().toISOString() }).eq("unsub_token", token).select("user_id");
  return !error && !!data?.length;
}

function emailHtml(days: number, unsubUrl: string) {
  const link = `${SITE_URL}/learn/dashboard?utm_source=reminder&utm_medium=email`;
  return `<!doctype html><html><body style="margin:0;background:#000;color:#f3f2ee;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid #3a3a40">
<tr><td style="padding:28px">
<p style="margin:0 0 6px;font:12px monospace;letter-spacing:.12em;text-transform:uppercase;color:#ff6b2b">System Design Mastery</p>
<h1 style="margin:0 0 12px;font-size:26px;line-height:1.2">Your ${days}-day streak ends tonight</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#c9c8c4">One lesson, a revision deck or a quick arena run keeps it going. Five minutes is enough.</p>
<a href="${link}" style="display:inline-block;background:#ff6b2b;color:#120700;text-decoration:none;font-weight:bold;padding:12px 20px">Keep my streak →</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#7e7e85">You switched on streak reminders on your Progress page. <a href="${unsubUrl}" style="color:#a3a3a8">Turn off these emails</a>.</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** The daily run. Returns counts only (no addresses in logs). */
export async function runReminders(now = new Date()): Promise<{ checked: number; atRisk: number; pushed: number; emailed: number; pruned: number }> {
  const { data, error } = await supabase.from("learner_reminders").select("user_id, email_on, push_on, push_subs, tz, last_sent_on, unsub_token").or("email_on.eq.true,push_on.eq.true");
  if (error) throw new Error(error.message);
  const rows = (data || []) as Row[];
  const out = { checked: rows.length, atRisk: 0, pushed: 0, emailed: 0, pruned: 0 };
  if (!rows.length) return out;
  const push = vapidReady();
  const since = prevDay(dayIn("Asia/Kolkata", now), 400);
  for (const r of rows) {
    const today = dayIn(r.tz, now);
    if (r.last_sent_on === today) continue;
    const { data: days } = await supabase.from("learning_streaks").select("activity_date").eq("user_id", r.user_id).gte("activity_date", since);
    const streak = atRisk(new Set((days || []).map((d) => String((d as { activity_date: string }).activity_date).slice(0, 10))), today);
    if (!streak) continue;
    out.atRisk++;
    let sent = false;
    if (r.push_on && push && r.push_subs?.length) {
      const keep: PushSubscription[] = [];
      for (const s of r.push_subs) {
        try {
          await webpush.sendNotification(s, JSON.stringify({ title: `Your ${streak}-day streak ends tonight`, body: "Five minutes keeps it going: one lesson or a revision deck.", url: "/learn/dashboard?utm_source=reminder&utm_medium=push", tag: "streak" }), { TTL: 6 * 3600 });
          keep.push(s);
          sent = true;
          out.pushed++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) out.pruned++; // device unsubscribed: drop it
          else keep.push(s);
        }
      }
      if (keep.length !== r.push_subs.length) await supabase.from("learner_reminders").update({ push_subs: keep, push_on: keep.length > 0 }).eq("user_id", r.user_id);
    }
    if (r.email_on) {
      const { data: u } = await supabase.auth.admin.getUserById(r.user_id);
      const to = u?.user?.email;
      if (to) {
        try {
          await sendRawEmail(to, `Your ${streak}-day streak ends tonight`, emailHtml(streak, `${SITE_URL}/api/reminders/unsubscribe?t=${r.unsub_token}`));
          sent = true;
          out.emailed++;
        } catch (e) {
          console.warn("[reminders] email failed", (e as Error).message);
        }
      }
    }
    if (sent) await supabase.from("learner_reminders").update({ last_sent_on: today }).eq("user_id", r.user_id);
  }
  return out;
}
