/**
 * DEV-ONLY stateful mock of /api/admin/newsletter/* for the admin preview (`?preview=1`). Loaded only
 * through shell/fixtures.ts (itself a dev-only dynamic import). Simulates queueing, ticks (25 per
 * call), and opens / clicks trickling in each time the campaign is fetched.
 */
import { listTemplates } from "@/lib/campaigns/templates";
import { SITE } from "@/lib/campaigns/links";
import type { AudienceCount, AudienceSpec, Campaign, CampaignCounts, CampaignSummary, EventRow, MessageRow, NewsletterInfo, RecipientPreview, Sender, TemplateInfo } from "@/lib/campaigns/types";
import { displayStatus } from "@/lib/campaigns/types";
import type { StoryOption } from "@/lib/campaigns/types";
import { storyContent } from "@/lib/campaigns/story-doc";
import { checkName, isRecipientEmail, resolveName } from "@/lib/campaigns/names-core";
import { firstNameOf } from "@/lib/campaigns/tags";
import type { NamedPerson, NamesReply } from "@/lib/campaigns/types";

if (process.env.NODE_ENV !== "development") throw new Error("newsletter fixtures are dev-only");

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const r = rng(2026);
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const FIRST = ["Aarav", "Priya", "Rohan", "Sara", "Kabir", "Ananya", "Dev", "Meera", "Ishaan", "Tara", "Neil", "Zoya", "Arjun", "Diya", "Vikram", "Nisha", "Karan", "Riya", "Aditya", "Sneha"];
const LAST = ["Mehta", "Nair", "Gupta", "Iqbal", "Singh", "Rao", "Patel", "Joshi", "Verma", "Kapoor", "D'Souza", "Khan"];
// example domains only (RFC 2606): fixture addresses must never be real inboxes
const DOMAINS = ["example.com", "example.org", "example.net", "mail.example.com", "example.dev"];
const LESSONS = ["Consistent hashing", "Caching patterns that survive prod", "Rate limiting at the edge", "Message queues and backpressure", "Back-of-the-envelope estimation", ""];

/** `name` = the account's own name (profile, else sign-in metadata); admin overrides live in NAME_OVERRIDES. */
type Person = { email: string; name: string | null; nameSrc?: "profile" | "metadata" | null; userId: string | null; active: boolean; completed: number; streak: number; lastDays: number; subscriber: boolean; lesson: string };
const PEOPLE: Person[] = Array.from({ length: 214 }, (_, i) => {
  const f = FIRST[i % FIRST.length];
  const l = LAST[(i * 7) % LAST.length];
  const account = i < 196;
  // subscriber-only addresses never have a name; some email-OTP accounts don't either
  const named = account && i % 9 !== 4;
  const active = i % 11 !== 3;
  const fl = f.toLowerCase();
  const ll = l.toLowerCase().replace(/[^a-z]/g, "");
  // a few address shapes so "suggest from email" has easy, unsure and impossible cases
  const local = named || i % 3 === 0 ? `${fl}.${ll}${i > 19 ? i : ""}` : i % 3 === 1 ? `${fl}${100 + i}` : `${fl[0]}${ll}${i}`;
  return {
    email: `${local}@${DOMAINS[i % DOMAINS.length]}`,
    name: named ? `${f} ${l}` : null,
    nameSrc: named ? (i % 5 === 2 ? "metadata" : "profile") : null,
    userId: i < 196 ? `u-${i + 1}` : null,
    active: i < 196 && active,
    completed: active ? Math.floor(r() * 30) : 0,
    streak: active ? Math.floor(r() * 9) : 0,
    lastDays: active ? Math.floor(r() * 60) : 999,
    subscriber: i % 4 === 0 || i >= 196,
    lesson: active ? LESSONS[i % LESSONS.length] : "",
  };
});
const UNSUB = new Set(PEOPLE.filter((_, i) => i % 37 === 5).map((p) => p.email));
const BOUNCED = new Set(PEOPLE.filter((_, i) => i % 53 === 7).map((p) => p.email));

/* ───────────── recipient names (admin overrides, like public.email_names) ───────────── */

const NAME_OVERRIDES = new Map<string, { name: string; updatedAt: string; updatedBy: string | null }>([
  [PEOPLE[1].email, { name: "Priya Joshi-Rao", updatedAt: ago(5 * DAY), updatedBy: "preview@localhost" }],
  [PEOPLE[13].email, { name: "Diya Joshi", updatedAt: ago(3 * DAY), updatedBy: "preview@localhost" }],
  [PEOPLE[198].email, { name: "Aditya", updatedAt: ago(1 * DAY), updatedBy: "preview@localhost" }],
]);
const personOf = (email: string): Person => PEOPLE.find((p) => p.email === email) || { email, name: null, userId: null, active: false, completed: 0, streak: 0, lastDays: 999, subscriber: false, lesson: "" };
/** override → profile → metadata → none (names-core.ts, same as the server) */
const nameOf = (p: Person) => resolveName({ override: NAME_OVERRIDES.get(p.email)?.name, profile: p.nameSrc === "profile" ? p.name : null, metadata: p.nameSrc === "metadata" ? p.name : null });
const namedOf = (p: Person): NamedPerson => {
  const n = nameOf(p);
  const o = NAME_OVERRIDES.get(p.email);
  return {
    email: p.email,
    name: n.name,
    source: n.source,
    firstName: firstNameOf(n.name),
    profileName: p.nameSrc === "profile" ? p.name : null,
    metaName: p.nameSrc === "metadata" ? p.name : null,
    override: o ? { ...o } : null,
    userId: p.userId,
    kind: p.userId ? "account" : p.subscriber ? "subscriber" : "other",
    blocked: UNSUB.has(p.email) ? "unsubscribed" : BOUNCED.has(p.email) ? "suppressed" : null,
  };
};

const varsOf = (p: Person) => ({
  first_name: firstNameOf(nameOf(p).name),
  name: nameOf(p).name || "",
  email: p.email,
  streak: String(p.streak),
  lessons_completed: String(p.completed),
  current_lesson: p.lesson,
  resume_url: p.lesson ? `${SITE}/learn/system-design-mastery/week-03/consistent-hashing` : `${SITE}/learn`,
  site_url: SITE,
  unsubscribe_url: "",
});

function audience(spec: AudienceSpec, exclude?: Set<string>, storyEx?: Set<string>): { list: Person[]; count: AudienceCount } {
  let cands: Person[] = [];
  let invalid = 0;
  let duplicates = 0;
  const acc = PEOPLE.filter((p) => p.userId);
  switch (spec.kind) {
    case "all":
      cands = acc;
      break;
    case "learners":
      cands = acc.filter((p) => p.active);
      break;
    case "subscribers":
      cands = PEOPLE.filter((p) => p.subscriber);
      break;
    case "subscribers_learners": {
      const seen = new Set<string>();
      for (const p of [...PEOPLE.filter((x) => x.subscriber), ...acc.filter((x) => x.active)]) {
        if (seen.has(p.email)) duplicates++;
        else {
          seen.add(p.email);
          cands.push(p);
        }
      }
      break;
    }
    case "active":
      cands = acc.filter((p) => p.lastDays <= (spec.days || 30));
      break;
    case "never_started":
      cands = acc.filter((p) => !p.active);
      break;
    case "completed":
      cands = acc.filter((p) => p.completed >= (spec.min || 1));
      break;
    case "custom": {
      const seen = new Set<string>();
      for (const raw of (spec.emails || "").split(/[\s,;]+/).filter(Boolean)) {
        const e = raw.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) invalid++;
        else if (seen.has(e)) duplicates++;
        else {
          seen.add(e);
          cands.push(personOf(e));
        }
      }
    }
  }
  let unsubscribed = 0,
    suppressed = 0,
    alreadyQueued = 0,
    alreadyGotStory = 0;
  const list = cands.filter((p) => {
    if (UNSUB.has(p.email)) return (unsubscribed++, false);
    if (BOUNCED.has(p.email)) return (suppressed++, false);
    if (exclude?.has(p.email)) return (alreadyQueued++, false);
    if (storyEx?.has(p.email)) return (alreadyGotStory++, false);
    return true;
  });
  return { list, count: { eligible: list.length, unsubscribed, suppressed, invalid, duplicates, alreadyQueued, alreadyGotStory, sample: list.slice(0, 6).map((p) => p.email) } };
}

/* ───────────── stories (real titles; generated with the same builder the server uses) ───────────── */

const C = (n: string) => `${SITE}/covers/${n}.png`;
const STORY_SRC = [
  { slug: "irctc-tatkal-500-seats-2-million-users", caseId: "CASE-010", title: "The Tatkal Gamble: How India Sells 500 Train Seats to 2 Million People Without a Single Mistake", type: "design", typeLabel: "System design", mins: 12, date: "2026-08-05", cover: C("irctc-tatkal-rush"), excerpt: "Every morning at 10 AM, millions of Indians fight for a few hundred train seats in a battle that lasts less than a minute.", bullets: ["The Anatomy of a Tatkal Rush", "The Virtual Waiting Room", "Real War Stories"], activity: { kind: "simulation", title: "Rush control room", blurb: "", minutes: 3 }, xp: 75 },
  { slug: "bridgelink-remote-android-testing", caseId: "CASE-009", title: "From Office-Bound Devices to Global Access: Building BridgeLink", type: "build", typeLabel: "Build log", mins: 18, date: "2025-11-27", cover: C("bridgelink-remote-testing-revolution"), excerpt: "How we turned a drawer of Android phones into a remote device lab anyone on the team could use from anywhere.", bullets: ["When Your Test Devices Are Miles Away", "Transforming Developer Workflows", "The Tunnel Underneath"], activity: { kind: "fill the blanks", title: "Wire the tunnel", blurb: "", minutes: 2 }, xp: 25 },
  { slug: "cdn-cache-poisoning-disaster", caseId: "CASE-004", title: "The Silent Cache Poisoning Disaster: When CDN Becomes Your Enemy", type: "incident", typeLabel: "Incident", mins: 16, date: "2025-08-08", cover: C("cdn-cache-poisoning-disaster"), excerpt: "A Black Friday nightmare where a misconfigured CDN turned private customer data into a public cache.", bullets: ["Following the Digital Breadcrumbs", "The Robust Caching Strategy: Never Again", "The Philosophical Shift"], activity: { kind: "spot the bug", title: "Find the leak", blurb: "", minutes: 3 }, xp: 25 },
  { slug: "websockets-vs-webrtc-video-communication", caseId: "CASE-002", title: "The Great Video Call Revolution: WebSockets vs WebRTC", type: "design", typeLabel: "System design", mins: 14, date: "2025-08-05", cover: C("websockets-webrtc-comparison"), excerpt: "Emma's demo died because video went through a WebSocket server. Here's why, and what to use instead.", bullets: ["Client-Server vs Peer-to-Peer", "Best of Both Worlds", "Sizing a Call"], activity: { kind: "topology picker", title: "Pick the pipe", blurb: "", minutes: 2 }, xp: 25 },
];
const STORY_SENT = new Map<string, Set<string>>([["cdn-cache-poisoning-disaster", new Set(PEOPLE.filter((_, i) => i % 6 === 1).map((p) => p.email))]]);
const storyOptions = (): StoryOption[] =>
  STORY_SRC.map((x) => ({ slug: x.slug, caseId: x.caseId, title: x.title, type: x.type, typeLabel: x.typeLabel, mins: x.mins, date: x.date, cover: x.cover, excerpt: x.excerpt, sentTo: STORY_SENT.get(x.slug)?.size ?? 0, content: storyContent(x) }));

/* ───────────── state ───────────── */

type Msg = MessageRow & { token: string };
type Entry = { c: Campaign; msgs: Msg[]; events: EventRow[]; cron?: boolean };
const state = new Map<string, Entry>();
let seq = 1;
let templatesCache: TemplateInfo[] | null = null;
const templates = () => (templatesCache ??= listTemplates());

const SENDERS: Sender[] = [
  {
    id: "env:smtp",
    label: "Default (SMTP_FROM)",
    fromName: "Himanshu Kukreja",
    fromEmail: "no-reply@himanshukukreja.in",
    replyTo: "kukreja.him@gmail.com",
    transport: "smtp",
    isDefault: true,
    source: "env",
    check: { level: "warn", message: "himanshukukreja.in matches the domain this transport already sends from (SMTP_FROM). Set SMTP_VERIFIED_DOMAINS to confirm." },
  },
  {
    id: "5b0c1a52-1c1e-4d38-9a51-2b2b8f0d1a01",
    label: "Course updates",
    fromName: "Himanshu from SDM",
    fromEmail: "learn@himanshukukreja.in",
    replyTo: "kukreja.him@gmail.com",
    transport: "smtp",
    isDefault: false,
    source: "db",
    check: { level: "ok", message: "himanshukukreja.in is listed as verified for Brevo." },
  },
  {
    id: "5b0c1a52-1c1e-4d38-9a51-2b2b8f0d1a02",
    label: "Personal",
    fromName: "Himanshu Kukreja",
    fromEmail: "kukreja.him@gmail.com",
    replyTo: null,
    transport: "smtp",
    isDefault: false,
    source: "db",
    check: { level: "warn", message: "gmail.com isn't a known verified domain for Brevo. Brevo only delivers from senders or domains verified under Senders, Domains & Dedicated IPs." },
  },
];

function counts(e: Entry): CampaignCounts {
  const c: CampaignCounts = { total: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, opened: 0, opens: 0, clicked: 0, clicks: 0, unsubscribed: 0, stuck: 0 };
  for (const m of e.msgs) {
    c.total++;
    c[m.status]++;
    if (m.firstOpenAt) c.opened++;
    c.opens += m.openCount;
    if (m.clickCount) c.clicked++;
    c.clicks += m.clickCount;
    if (m.unsubscribedAt) c.unsubscribed++;
  }
  return c;
}
const summary = (e: Entry): CampaignSummary => {
  const { doc: _d, ...rest } = e.c;
  void _d;
  return { ...rest, counts: counts(e) };
};

const tok = () => Math.random().toString(36).slice(2, 14);
function makeMsgs(people: Person[]): Msg[] {
  return people.map((p) => ({
    id: seq++,
    token: tok(),
    email: p.email,
    name: nameOf(p).name,
    userId: p.userId,
    status: "queued",
    error: null,
    sentAt: null,
    openCount: 0,
    firstOpenAt: null,
    lastOpenAt: null,
    clickCount: 0,
    firstClickAt: null,
    lastClickAt: null,
    unsubscribedAt: null,
    createdAt: new Date().toISOString(),
  }));
}

function open(e: Entry, m: Msg, at: string, click = false) {
  m.openCount++;
  m.firstOpenAt ||= at;
  m.lastOpenAt = at;
  e.events.unshift({ at, type: "open", email: m.email, url: null });
  if (click) {
    m.clickCount++;
    m.firstClickAt ||= at;
    m.lastClickAt = at;
    e.events.unshift({ at, type: "click", email: m.email, url: `${SITE}/learn?utm_source=email` });
  }
}

function seed() {
  if (state.size) return;
  const t = templates();
  const revamp = t.find((x) => x.id === "learn-revamp") || t[0];
  const blank = t.find((x) => x.id === "blank") || t[0];
  const welcome = t.find((x) => x.id === "welcome") || t[0];
  const mk = (id: string, tpl: TemplateInfo, patch: Partial<Campaign>): Campaign => ({
    id,
    name: tpl.name,
    subject: tpl.subject,
    subjectFallback: tpl.subjectFallback,
    preheader: tpl.preheader,
    template: tpl.id,
    doc: tpl.doc,
    senderId: "env:smtp",
    sender: null,
    audience: { kind: "learners" },
    trackOpens: true,
    trackClicks: true,
    status: "draft",
    lastError: null,
    createdBy: "preview@localhost",
    createdAt: ago(3 * DAY),
    updatedAt: ago(2 * DAY),
    queuedAt: null,
    startedAt: null,
    finishedAt: null,
    lockUntil: null,
    scheduledAt: null,
    storySlug: null,
    ...patch,
  });
  // 1 · the revamp announcement, sent two days ago
  const a: Entry = {
    c: mk("c0ffee00-0000-4000-8000-000000000001", revamp, {
      name: "Learn revamp · all learners",
      status: "sent",
      sender: { fromName: "Himanshu Kukreja", fromEmail: "no-reply@himanshukukreja.in", replyTo: "kukreja.him@gmail.com", transport: "smtp" },
      queuedAt: ago(2 * DAY + HOUR),
      startedAt: ago(2 * DAY + HOUR),
      finishedAt: ago(2 * DAY),
    }),
    msgs: [],
    events: [],
  };
  a.msgs = makeMsgs(audience({ kind: "learners" }).list);
  a.msgs.forEach((m, i) => {
    m.sentAt = ago(2 * DAY + HOUR - i * 2000);
    if (i % 61 === 9) {
      m.status = "failed";
      m.error = "550 5.1.1 mailbox unavailable";
      m.sentAt = null;
      return;
    }
    m.status = "sent";
    const x = r();
    if (x < 0.58) open(a, m, ago(2 * DAY - x * 40 * HOUR), x < 0.19);
    if (x < 0.12) open(a, m, ago(x * 20 * HOUR));
    if (i === 33) m.unsubscribedAt = ago(30 * HOUR);
  });
  a.events.sort((p, q) => q.at.localeCompare(p.at));
  state.set(a.c.id, a);
  // 2 · a draft newsletter
  state.set("c0ffee00-0000-4000-8000-000000000002", { c: mk("c0ffee00-0000-4000-8000-000000000002", blank, { name: "Week 4 nudge · active learners", audience: { kind: "active", days: 14 }, createdAt: ago(5 * HOUR), updatedAt: ago(40 * MIN) }), msgs: [], events: [] });
  // 3 · welcome backfill, paused halfway
  const w: Entry = {
    c: mk("c0ffee00-0000-4000-8000-000000000003", welcome, {
      name: "Welcome backfill · never started",
      audience: { kind: "never_started" },
      status: "paused",
      sender: { fromName: "Himanshu from SDM", fromEmail: "learn@himanshukukreja.in", replyTo: "kukreja.him@gmail.com", transport: "smtp" },
      queuedAt: ago(6 * HOUR),
      startedAt: ago(6 * HOUR),
      createdAt: ago(7 * HOUR),
      updatedAt: ago(6 * HOUR),
    }),
    msgs: [],
    events: [],
  };
  w.msgs = makeMsgs(audience({ kind: "never_started" }).list);
  w.msgs.slice(0, 9).forEach((m, i) => {
    m.status = "sent";
    m.sentAt = ago(6 * HOUR - i * 3000);
    if (i % 3 === 0) open(w, m, ago(5 * HOUR - i * MIN));
  });
  state.set(w.c.id, w);
  // 4 · a case-file update scheduled for tomorrow 09:00 IST
  const story = storyOptions()[0];
  const tpl = t.find((x) => x.id === "story") || blank;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const at = new Date(new Date(`${today}T09:00:00+05:30`).getTime() + DAY).toISOString();
  state.set("c0ffee00-0000-4000-8000-000000000004", {
    c: mk("c0ffee00-0000-4000-8000-000000000004", tpl, {
      name: `${story.caseId} · The Tatkal Gamble`,
      ...story.content,
      audience: { kind: "subscribers_learners" },
      status: "scheduled",
      scheduledAt: at,
      storySlug: story.slug,
      sender: { fromName: "Himanshu Kukreja", fromEmail: "no-reply@himanshukukreja.in", replyTo: "kukreja.him@gmail.com", transport: "smtp" },
      createdAt: ago(3 * HOUR),
      updatedAt: ago(2 * HOUR),
    }),
    msgs: [],
    events: [],
  });
}

/** Opens / clicks arriving while you watch (each fetch of a campaign). */
function trickle(e: Entry) {
  if (e.c.status === "draft") return;
  const now = new Date().toISOString();
  for (const m of e.msgs) {
    if (m.status !== "sent") continue;
    const x = Math.random();
    if (!m.firstOpenAt && x < 0.08) open(e, m, now, x < 0.025);
  }
}

/** The scheduled campaign's recipients are frozen when it starts (like the real cron's promote). */
function promote(e: Entry) {
  const { list } = audience(e.c.audience, new Set(e.msgs.map((x) => x.email)), e.c.storySlug ? STORY_SENT.get(e.c.storySlug) : undefined);
  e.msgs.push(...makeMsgs(list));
  Object.assign(e.c, { status: "sending", queuedAt: new Date().toISOString() });
}

/** Stand-in for Supabase pg_cron: promote due scheduled campaigns, send 25 per call for cron-started ones. */
function cronSim() {
  for (const e of state.values()) {
    if (e.c.status === "scheduled" && e.c.scheduledAt && new Date(e.c.scheduledAt).getTime() <= Date.now()) {
      promote(e);
      e.cron = true;
    } else if (e.cron && e.c.status === "sending") {
      e.msgs
        .filter((x) => x.status === "queued")
        .slice(0, 25)
        .forEach((x) => Object.assign(x, { status: "sent", sentAt: new Date().toISOString() }));
      if (!e.msgs.some((x) => x.status === "queued")) Object.assign(e.c, { status: "sent", finishedAt: new Date().toISOString() });
    }
  }
}

function info(): NewsletterInfo {
  seed();
  return {
    setup: { schedulingReady: true, tablesReady: true, missing: [], transportMode: "console", trackingBase: SITE, batch: { size: 25, gapMs: 400, budgetMs: 40_000 }, admin: "preview@localhost" },
    transports: [
      { id: "smtp", label: "SMTP (SMTP_*)", configured: true, host: "smtp-relay.brevo.com", provider: "Brevo", verifiedDomains: ["himanshukukreja.in"], verifiedSource: "assumed", note: "Brevo only delivers from senders or domains verified under Senders, Domains & Dedicated IPs." },
      { id: "smtp2", label: "Second SMTP (SMTP2_*)", configured: false, host: null, provider: "SMTP", verifiedDomains: [], verifiedSource: "none", note: "" },
    ],
    senders: SENDERS,
    campaigns: [...state.values()].map(summary).sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
  };
}

const body = (init?: RequestInit) => {
  try {
    return JSON.parse(String(init?.body || "{}"));
  } catch {
    return {};
  }
};
const fail = (message: string, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

function filterMsgs(e: Entry, filter: string, q: string) {
  return e.msgs.filter((m) => {
    const d = displayStatus(m);
    const okF =
      filter === "all" ||
      (filter === "opened" ? d === "opened" || d === "clicked" : filter === "unopened" ? d === "sent" : filter === "clicked" ? m.clickCount > 0 : filter === "unsubscribed" ? !!m.unsubscribedAt : m.status === filter);
    return okF && (!q || m.email.includes(q) || (m.name || "").toLowerCase().includes(q));
  });
}

/** /api/admin/newsletter/names: list (GET/POST), set (PUT/PATCH, all-or-nothing), clear (DELETE). */
function namesFixture(u: URL, method: string, b: Record<string, unknown>): unknown {
  if (method === "PUT" || method === "PATCH") {
    const raw = (Array.isArray(b.items) ? b.items : [{ email: b.email, name: b.name }]) as { email?: unknown; name?: unknown }[];
    const errors: { index: number; email: string; error: string }[] = [];
    const ok: { email: string; name: string }[] = [];
    raw.forEach((it, index) => {
      const email = String(it?.email || "").trim().toLowerCase();
      if (!isRecipientEmail(email)) return errors.push({ index, email, error: "Not a valid email address." });
      const c = checkName(it?.name);
      if (!c.ok) return errors.push({ index, email, error: c.error });
      ok.push({ email, name: c.name });
    });
    if (errors.length) throw Object.assign(new Error(errors.length === 1 ? `${errors[0].email}: ${errors[0].error}` : `${errors.length} names aren't valid; nothing was saved.`), { status: 400, errors });
    for (const x of ok) NAME_OVERRIDES.set(x.email, { name: x.name, updatedAt: new Date().toISOString(), updatedBy: "preview@localhost" });
    return { saved: ok.length, people: ok.map((x) => namedOf(personOf(x.email))) };
  }
  if (method === "DELETE") {
    const emails = (u.searchParams.get("email") ? [u.searchParams.get("email") as string] : Array.isArray(b.emails) ? (b.emails as string[]) : []).map((e) => e.toLowerCase());
    let cleared = 0;
    for (const e of emails) if (NAME_OVERRIDES.delete(e)) cleared++;
    return { cleared, people: emails.map((e) => namedOf(personOf(e))) };
  }
  if (Array.isArray(b.lookup)) return { people: (b.lookup as string[]).slice(0, 1000).map((e) => namedOf(personOf(String(e).toLowerCase()))) };
  const sp = u.searchParams;
  const spec = (method === "POST" ? (b.audience as AudienceSpec | undefined) : sp.get("kind") && sp.get("kind") !== "everyone" ? ({ kind: sp.get("kind"), days: Number(sp.get("days")) || undefined, min: Number(sp.get("min")) || undefined, emails: sp.get("emails") || undefined } as AudienceSpec) : undefined) || null;
  const q = String((method === "POST" ? b.q : sp.get("q")) || "").toLowerCase();
  const missingOnly = method === "POST" ? b.missing === true : sp.get("missing") === "1";
  const limit = Math.min(Number((method === "POST" ? b.limit : sp.get("limit")) || 100), 500);
  const offset = Number((method === "POST" ? b.offset : sp.get("offset")) || 0);
  const storySlug = String((method === "POST" ? b.storySlug : sp.get("storySlug")) || "");
  const base = spec ? audience(spec, undefined, storySlug ? STORY_SENT.get(storySlug) : undefined).list : [...PEOPLE, ...[...NAME_OVERRIDES.keys()].filter((e) => !PEOPLE.some((p) => p.email === e)).map(personOf)];
  const all = base.map(namedOf);
  const bySource = { override: 0, profile: 0, metadata: 0, none: 0 };
  for (const x of all) bySource[x.source]++;
  const filtered = all
    .filter((x) => (!missingOnly || x.source === "none") && (!q || x.email.includes(q) || (x.name || "").toLowerCase().includes(q)))
    .sort((x, y) => Number(x.source !== "none") - Number(y.source !== "none") || x.email.localeCompare(y.email));
  const reply: NamesReply = { people: filtered.slice(offset, offset + limit), total: all.length, matched: filtered.length, missing: bySource.none, bySource, namesReady: true, offset, limit };
  return reply;
}

export function resolveNewsletterFixture(u: URL, init?: RequestInit): unknown {
  seed();
  cronSim();
  const method = (init?.method || "GET").toUpperCase();
  const p = u.pathname.replace(/^\/api\/admin\/newsletter/, "");
  if (p === "" && method === "GET") return info();
  if (p === "/templates") return { templates: templates() };
  if (p === "/stories") return { stories: storyOptions() };
  if (p === "/senders") return method === "GET" ? { senders: SENDERS, transports: info().transports, dbError: null } : { sender: body(init) };
  if (p.startsWith("/senders/")) return { ok: true };
  if (p === "/recipients") {
    const q = (u.searchParams.get("q") || "").toLowerCase();
    const list: RecipientPreview[] = PEOPLE.filter((x) => !q || x.email.includes(q) || (nameOf(x).name || "").toLowerCase().includes(q))
      .sort((x, y) => Number(!x.userId) - Number(!y.userId) || x.lastDays - y.lastDays)
      .slice(0, 8)
      .map((x) => ({ email: x.email, name: nameOf(x).name, nameSource: nameOf(x).source, userId: x.userId, vars: varsOf(x), source: x.userId ? "account" : "subscriber" }));
    return { recipients: list };
  }
  if (p === "/names") return namesFixture(u, method, body(init));
  if (p === "/audience") {
    const b = body(init);
    const e = b.campaignId ? state.get(b.campaignId) : undefined;
    const ex = e ? new Set(e.msgs.map((m) => m.email)) : undefined;
    const storyEx = e?.c.storySlug || b.storySlug ? STORY_SENT.get(e?.c.storySlug || b.storySlug) : undefined;
    const presets = { subscribers_learners: audience({ kind: "subscribers_learners" }).count.eligible, all: audience({ kind: "all" }).count.eligible, learners: audience({ kind: "learners" }).count.eligible, subscribers: audience({ kind: "subscribers" }).count.eligible, never_started: audience({ kind: "never_started" }).count.eligible };
    return { count: audience(b.audience || { kind: "learners" }, ex, storyEx).count, presets };
  }
  if (p === "/test") {
    const b = body(init);
    const as = PEOPLE.find((x) => x.email === b.asEmail);
    const first = as ? firstNameOf(nameOf(as).name) : "";
    const subj = first ? String(b.subject || "").replace(/\{\{\s*first_name[^}]*\}\}/g, first) : b.subjectFallback || b.subject;
    return { ok: true, mode: "console", to: b.to || "preview@localhost", as: b.asEmail || "preview@localhost", subject: `[test] ${subj}`, bytes: 16_000 };
  }
  if (p === "/campaigns" && method === "POST") {
    const b = body(init);
    const id = `c0ffee00-0000-4000-8000-${String(100 + seq++).padStart(12, "0")}`;
    const c: Campaign = { ...b, id, status: "draft", sender: null, lastError: null, createdBy: "preview@localhost", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), queuedAt: null, startedAt: null, finishedAt: null, lockUntil: null, scheduledAt: null, storySlug: b.doc?.story?.slug ?? null };
    state.set(id, { c, msgs: [], events: [] });
    return { campaign: { ...summary(state.get(id)!), doc: c.doc } };
  }
  const m = /^\/campaigns\/([^/]+)(\/send|\/recipients)?$/.exec(p);
  if (m) {
    const e = state.get(m[1]);
    if (!e) return fail("Campaign not found", 404);
    if (!m[2]) {
      if (method === "GET") {
        trickle(e);
        return { campaign: { ...summary(e), doc: e.c.doc }, events: e.events.slice(0, 40) };
      }
      if (method === "PATCH") {
        const pb = body(init);
        Object.assign(e.c, pb, { updatedAt: new Date().toISOString(), storySlug: pb.doc?.story?.slug ?? e.c.storySlug });
        return { campaign: { ...summary(e), doc: e.c.doc } };
      }
      if (method === "DELETE") {
        state.delete(e.c.id);
        return { ok: true };
      }
    }
    if (m[2] === "/recipients") {
      const rows = filterMsgs(e, u.searchParams.get("filter") || "all", (u.searchParams.get("q") || "").toLowerCase());
      const offset = Number(u.searchParams.get("offset") || 0);
      const limit = Number(u.searchParams.get("limit") || 50);
      return { rows: rows.slice(offset, offset + limit), total: rows.length, offset, limit };
    }
    if (m[2] === "/send") {
      const b = body(init);
      const done = () => ({ campaign: summary(e) });
      switch (b.action) {
        case "schedule": {
          const { list } = audience(e.c.audience, new Set(e.msgs.map((x) => x.email)), e.c.storySlug ? STORY_SENT.get(e.c.storySlug) : undefined);
          if (b.confirm !== `send to ${list.length}`) fail(`Type "send to ${list.length}" to confirm.`);
          if (!b.at || new Date(b.at).getTime() - Date.now() < 60_000) fail("Pick a time at least a minute from now (or use “send now”).");
          Object.assign(e.c, { status: "scheduled", scheduledAt: new Date(b.at).toISOString(), sender: SENDERS.find((s) => s.id === e.c.senderId) || SENDERS[0] });
          return done();
        }
        case "reschedule":
          if (e.c.status !== "scheduled") fail("Only scheduled campaigns can be rescheduled.", 409);
          if (!b.at || new Date(b.at).getTime() - Date.now() < 60_000) fail("Pick a time at least a minute from now.");
          e.c.scheduledAt = new Date(b.at).toISOString();
          return done();
        case "unschedule":
          Object.assign(e.c, { status: "draft", scheduledAt: null });
          return done();
        case "send-now":
          promote(e);
          return { added: e.msgs.length, status: e.c.status };
        case "queue": {
          const { list } = audience(e.c.audience, new Set(e.msgs.map((x) => x.email)), e.c.storySlug ? STORY_SENT.get(e.c.storySlug) : undefined);
          if (b.confirm !== `send to ${list.length}`) fail(`Type "send to ${list.length}" to confirm.`);
          e.msgs.push(...makeMsgs(list));
          Object.assign(e.c, { status: "sending", queuedAt: e.c.queuedAt || new Date().toISOString(), sender: SENDERS.find((s) => s.id === e.c.senderId) || SENDERS[0] });
          return { added: list.length, ...done() };
        }
        case "tick": {
          if (e.c.status !== "sending") return { ...done(), sentNow: 0, failedNow: [], skippedNow: 0, done: true, transport: "console" };
          const batch = e.msgs.filter((x) => x.status === "queued").slice(0, 25);
          const failedNow: { email: string; error: string }[] = [];
          for (const x of batch) {
            if (x.email.startsWith("tara")) {
              x.status = "failed";
              x.error = "550 5.1.1 recipient rejected";
              failedNow.push({ email: x.email, error: x.error });
            } else {
              x.status = "sent";
              x.sentAt = new Date().toISOString();
              x.name = nameOf(personOf(x.email)).name; // names re-read per batch, like the server
            }
          }
          const left = e.msgs.some((x) => x.status === "queued");
          if (!left) Object.assign(e.c, { status: "sent", finishedAt: new Date().toISOString() });
          return { ...done(), sentNow: batch.length - failedNow.length, failedNow, skippedNow: 0, done: !left, transport: "console" };
        }
        case "pause":
          e.c.status = "paused";
          return done();
        case "resume":
          e.c.status = "sending";
          return done();
        case "cancel":
          e.c.status = "cancelled";
          e.msgs.forEach((x) => x.status === "queued" && Object.assign(x, { status: "skipped", error: "cancelled" }));
          return done();
        case "retry": {
          let n = 0;
          e.msgs.forEach((x) => x.status === "failed" && b.failed !== false && (Object.assign(x, { status: "queued", error: null }), n++));
          if (n) e.c.status = "sending";
          return { requeued: n, ...done() };
        }
      }
    }
  }
  return undefined;
}

export function resolveNewsletterFixtureText(u: URL): string | undefined {
  const m = /^\/api\/admin\/newsletter\/campaigns\/([^/]+)\/recipients$/.exec(u.pathname);
  if (!m || u.searchParams.get("format") !== "csv") return undefined;
  const e = state.get(m[1]);
  if (!e) return "";
  const rows = filterMsgs(e, u.searchParams.get("filter") || "all", "");
  return ["email,name,status,sent_at,opens,clicks", ...rows.map((x) => [x.email, x.name || "", displayStatus(x), x.sentAt || "", x.openCount, x.clickCount].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
}
