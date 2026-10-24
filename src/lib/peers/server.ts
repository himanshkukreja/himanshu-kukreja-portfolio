/**
 * Peer mock interviews (server only). A learner posts a slot: a time, one of the course's mock
 * interviews and a preferred role. Another signed-in learner pairs up; both get an email with the
 * time, a free video room and the interviewer's rubric (the mock's own page). Names and emails are
 * shared only between the two people who paired. Table: public.peer_slots (20261025 migration).
 */
import "server-only";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendRawEmail } from "@/lib/mailer";
import { SITE_URL } from "@/lib/site";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";

export type PeerRole = "candidate" | "interviewer" | "either";
type Row = { id: string; user_id: string; starts_at: string; duration_min: number; mock_slug: string; role: PeerRole; note: string; status: "open" | "paired" | "cancelled"; partner_id: string | null; room: string | null };

export type SlotView = {
  id: string;
  startsAt: string;
  durationMin: number;
  mock: { slug: string; title: string; company: string; href: string } | null;
  role: PeerRole;
  note: string;
  status: Row["status"];
  host: string;
  mine: boolean;
  joined: boolean;
  /** only for the two people in a paired slot */
  partner?: { name: string; email: string | null } | null;
  room?: string | null;
};

const MAX_OPEN = 5;
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

async function names(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data } = await supabase.from("user_profiles").select("id, full_name").in("id", uniq);
  return new Map((data || []).map((p) => [String((p as { id: string }).id), firstName((p as { full_name: string | null }).full_name)]));
}
const firstName = (n: string | null | undefined) => (n || "").trim().split(/\s+/)[0] || "A learner";

async function mocks() {
  const map = await getCourseMap(COURSE_ID).catch(() => null);
  return new Map((map?.mocks || []).map((m) => [m.slug, { slug: m.slug, title: m.title, company: m.company, href: m.href }]));
}

async function emailOf(id: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(id);
  return data?.user?.email ?? null;
}

/** Upcoming open slots (everyone's) plus the viewer's own and paired ones. */
export async function listSlots(me: string | null): Promise<SlotView[]> {
  const nowIso = new Date(Date.now() - 2 * 3600_000).toISOString();
  const open = await supabase.from("peer_slots").select("*").eq("status", "open").gte("starts_at", new Date().toISOString()).order("starts_at").limit(100);
  const mine = me ? await supabase.from("peer_slots").select("*").neq("status", "cancelled").or(`user_id.eq.${me},partner_id.eq.${me}`).gte("starts_at", nowIso).order("starts_at").limit(50) : { data: [] };
  const rows = new Map<string, Row>();
  for (const r of [...((open.data || []) as Row[]), ...((mine.data || []) as Row[])]) rows.set(r.id, r);
  const all = [...rows.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const [who, m] = await Promise.all([names(all.flatMap((r) => [r.user_id, r.partner_id || ""])), mocks()]);
  const out: SlotView[] = [];
  for (const r of all) {
    const mineHost = r.user_id === me;
    const joined = !!me && r.partner_id === me;
    const v: SlotView = { id: r.id, startsAt: r.starts_at, durationMin: r.duration_min, mock: m.get(r.mock_slug) || null, role: r.role, note: r.note, status: r.status, host: who.get(r.user_id) || "A learner", mine: mineHost, joined };
    if (r.status === "paired" && (mineHost || joined)) {
      const other = mineHost ? r.partner_id : r.user_id;
      v.partner = other ? { name: who.get(other) || "Your partner", email: await emailOf(other) } : null;
      v.room = r.room;
    }
    out.push(v);
  }
  return out;
}

export async function createSlot(me: string, body: Record<string, unknown>): Promise<void> {
  const starts = new Date(String(body.startsAt || ""));
  if (Number.isNaN(starts.getTime())) throw httpError("Pick a date and time.");
  if (starts.getTime() < Date.now() + 30 * 60_000) throw httpError("Pick a time at least 30 minutes from now.");
  if (starts.getTime() > Date.now() + 30 * 86400_000) throw httpError("Pick a time within the next 30 days.");
  const m = await mocks();
  const slug = String(body.mockSlug || "");
  if (!m.has(slug)) throw httpError("Pick one of the course's mock interviews.");
  const role = (["candidate", "interviewer", "either"] as const).includes(body.role as PeerRole) ? (body.role as PeerRole) : "either";
  const duration = Math.min(120, Math.max(30, Number(body.durationMin) || 60));
  const note = String(body.note || "").replace(/\s+/g, " ").trim().slice(0, 280);
  const { count } = await supabase.from("peer_slots").select("id", { count: "exact", head: true }).eq("user_id", me).eq("status", "open").gte("starts_at", new Date().toISOString());
  if ((count || 0) >= MAX_OPEN) throw httpError(`You already have ${MAX_OPEN} open slots. Cancel one first.`);
  const { error } = await supabase.from("peer_slots").insert({ user_id: me, starts_at: starts.toISOString(), duration_min: duration, mock_slug: slug, role, note });
  if (error) throw httpError(error.message, 500);
}

function when(iso: string) {
  const d = new Date(iso);
  const ist = d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return `${ist} IST (${d.toUTCString().replace(/:\d\d GMT$/, " UTC")})`;
}

function pairedEmail(o: { toName: string; partnerName: string; partnerEmail: string | null; startsAt: string; minutes: number; mockTitle: string; mockHref: string; role: string; room: string }) {
  const rubric = `${SITE_URL}${o.mockHref}`;
  return `<!doctype html><html><body style="margin:0;background:#000;color:#f3f2ee;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid #3a3a40"><tr><td style="padding:28px">
<p style="margin:0 0 6px;font:12px monospace;letter-spacing:.12em;text-transform:uppercase;color:#ff6b2b">Peer mock interview</p>
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25">Hi ${o.toName}, you're paired with ${o.partnerName}</h1>
<p style="margin:0 0 6px;font-size:15px;color:#c9c8c4"><b style="color:#f3f2ee">When:</b> ${when(o.startsAt)}, ${o.minutes} minutes</p>
<p style="margin:0 0 6px;font-size:15px;color:#c9c8c4"><b style="color:#f3f2ee">Interview:</b> ${o.mockTitle}</p>
<p style="margin:0 0 18px;font-size:15px;color:#c9c8c4"><b style="color:#f3f2ee">Roles:</b> ${o.role}${o.partnerEmail ? `. Reach ${o.partnerName} at <a href="mailto:${o.partnerEmail}" style="color:#ff6b2b">${o.partnerEmail}</a>.` : ""}</p>
<a href="${o.room}" style="display:inline-block;background:#ff6b2b;color:#120700;text-decoration:none;font-weight:bold;padding:12px 18px">Join the video room →</a>
<p style="margin:18px 0 0;font-size:14px;line-height:1.55;color:#c9c8c4">The interviewer runs it from the mock's page: phases, curveballs and the levelled rubric are all there: <a href="${rubric}" style="color:#ff6b2b">${rubric}</a>. Swap roles for a second round if you have time.</p>
<p style="margin:18px 0 0;font-size:12px;color:#7e7e85">Can't make it? Cancel from the peer practice page so your partner knows.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export async function joinSlot(me: string, id: string): Promise<void> {
  const room = `https://meet.jit.si/sdm-peer-${crypto.randomBytes(9).toString("base64url")}`;
  // atomic: only an open, future slot that isn't mine
  const { data, error } = await supabase
    .from("peer_slots")
    .update({ status: "paired", partner_id: me, room, paired_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "open")
    .neq("user_id", me)
    .gte("starts_at", new Date().toISOString())
    .select("*");
  if (error) throw httpError(error.message, 500);
  const r = (data || [])[0] as Row | undefined;
  if (!r) throw httpError("Someone else just took that slot, or it has passed.", 409);
  const [who, m, hostEmail, meEmail] = await Promise.all([names([r.user_id, me]), mocks(), emailOf(r.user_id), emailOf(me)]);
  const mock = m.get(r.mock_slug);
  const host = who.get(r.user_id) || "A learner";
  const guest = who.get(me) || "A learner";
  const roleText = r.role === "candidate" ? `${host} is the candidate, ${guest} interviews` : r.role === "interviewer" ? `${host} interviews, ${guest} is the candidate` : "decide together (swap halfway)";
  const base = { startsAt: r.starts_at, minutes: r.duration_min, mockTitle: mock ? `${mock.title} (${mock.company})` : r.mock_slug, mockHref: mock?.href || "/learn/mock", role: roleText, room };
  const sends: Promise<unknown>[] = [];
  if (hostEmail) sends.push(sendRawEmail(hostEmail, `Paired: peer mock interview with ${guest}`, pairedEmail({ ...base, toName: host, partnerName: guest, partnerEmail: meEmail })));
  if (meEmail) sends.push(sendRawEmail(meEmail, `Paired: peer mock interview with ${host}`, pairedEmail({ ...base, toName: guest, partnerName: host, partnerEmail: hostEmail })));
  await Promise.allSettled(sends);
}

/** The host cancels the slot; the partner leaving re-opens it for someone else. */
export async function cancelSlot(me: string, id: string): Promise<void> {
  const { data } = await supabase.from("peer_slots").select("*").eq("id", id).maybeSingle();
  const r = data as Row | null;
  if (!r) throw httpError("Slot not found.", 404);
  if (r.user_id === me) {
    await supabase.from("peer_slots").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id);
    const other = r.partner_id ? await emailOf(r.partner_id) : null;
    if (other) await sendRawEmail(other, "Your peer mock interview was cancelled", `<p>Your partner cancelled the peer mock interview planned for ${when(r.starts_at)}. Find another slot at <a href="${SITE_URL}/learn/mock/peers">${SITE_URL}/learn/mock/peers</a>.</p>`).catch(() => null);
  } else if (r.partner_id === me) {
    await supabase.from("peer_slots").update({ status: "open", partner_id: null, room: null, paired_at: null, updated_at: new Date().toISOString() }).eq("id", id);
    const host = await emailOf(r.user_id);
    if (host) await sendRawEmail(host, "Your peer mock partner can't make it", `<p>Your partner left the slot for ${when(r.starts_at)}. It's open again, so someone else can pair with you: <a href="${SITE_URL}/learn/mock/peers">${SITE_URL}/learn/mock/peers</a>.</p>`).catch(() => null);
  } else throw httpError("That isn't your slot.", 403);
}
