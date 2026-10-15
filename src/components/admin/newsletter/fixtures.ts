/**
 * DEV-ONLY stateful mock of /api/admin/newsletter/* for the admin preview (`?preview=1`). Loaded only
 * through shell/fixtures.ts (itself a dev-only dynamic import). Simulates queueing, ticks (25 per
 * call), and opens / clicks trickling in each time the campaign is fetched.
 */
import { listTemplates } from "@/lib/campaigns/templates";
import { SITE } from "@/lib/campaigns/links";
import type { AudienceCount, AudienceSpec, Campaign, CampaignCounts, CampaignSummary, EventRow, MessageRow, NewsletterInfo, RecipientPreview, Sender, TemplateInfo } from "@/lib/campaigns/types";
import { displayStatus } from "@/lib/campaigns/types";

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
const DOMAINS = ["gmail.com", "outlook.com", "proton.me", "company.dev", "icloud.com"];
const LESSONS = ["Consistent hashing", "Caching patterns that survive prod", "Rate limiting at the edge", "Message queues and backpressure", "Back-of-the-envelope estimation", ""];

type Person = { email: string; name: string | null; userId: string | null; active: boolean; completed: number; streak: number; lastDays: number; subscriber: boolean; lesson: string };
const PEOPLE: Person[] = Array.from({ length: 214 }, (_, i) => {
  const f = FIRST[i % FIRST.length];
  const l = LAST[(i * 7) % LAST.length];
  const named = i % 9 !== 4;
  const active = i % 11 !== 3;
  return {
    email: `${f.toLowerCase()}.${l.toLowerCase().replace(/[^a-z]/g, "")}${i > 19 ? i : ""}@${DOMAINS[i % DOMAINS.length]}`,
    name: named ? `${f} ${l}` : null,
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

const varsOf = (p: Person) => ({
  first_name: p.name ? p.name.split(" ")[0] : "",
  name: p.name || "",
  email: p.email,
  streak: String(p.streak),
  lessons_completed: String(p.completed),
  current_lesson: p.lesson,
  resume_url: p.lesson ? `${SITE}/learn/system-design-mastery/week-03/consistent-hashing` : `${SITE}/learn`,
  site_url: SITE,
  unsubscribe_url: "",
});

function audience(spec: AudienceSpec, exclude?: Set<string>): { list: Person[]; count: AudienceCount } {
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
          cands.push(PEOPLE.find((p) => p.email === e) || { email: e, name: null, userId: null, active: false, completed: 0, streak: 0, lastDays: 999, subscriber: false, lesson: "" });
        }
      }
    }
  }
  let unsubscribed = 0,
    suppressed = 0,
    alreadyQueued = 0;
  const list = cands.filter((p) => {
    if (UNSUB.has(p.email)) return (unsubscribed++, false);
    if (BOUNCED.has(p.email)) return (suppressed++, false);
    if (exclude?.has(p.email)) return (alreadyQueued++, false);
    return true;
  });
  return { list, count: { eligible: list.length, unsubscribed, suppressed, invalid, duplicates, alreadyQueued, sample: list.slice(0, 6).map((p) => p.email) } };
}

/* ───────────── state ───────────── */

type Msg = MessageRow & { token: string };
type Entry = { c: Campaign; msgs: Msg[]; events: EventRow[] };
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
    name: p.name,
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

function info(): NewsletterInfo {
  seed();
  return {
    setup: { tablesReady: true, missing: [], transportMode: "console", trackingBase: SITE, batch: { size: 25, gapMs: 400, budgetMs: 40_000 }, admin: "preview@localhost" },
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

export function resolveNewsletterFixture(u: URL, init?: RequestInit): unknown {
  seed();
  const method = (init?.method || "GET").toUpperCase();
  const p = u.pathname.replace(/^\/api\/admin\/newsletter/, "");
  if (p === "" && method === "GET") return info();
  if (p === "/templates") return { templates: templates() };
  if (p === "/senders") return method === "GET" ? { senders: SENDERS, transports: info().transports, dbError: null } : { sender: body(init) };
  if (p.startsWith("/senders/")) return { ok: true };
  if (p === "/recipients") {
    const q = (u.searchParams.get("q") || "").toLowerCase();
    const list: RecipientPreview[] = PEOPLE.filter((x) => x.userId && (!q || x.email.includes(q) || (x.name || "").toLowerCase().includes(q)))
      .sort((x, y) => x.lastDays - y.lastDays)
      .slice(0, 8)
      .map((x) => ({ email: x.email, name: x.name, userId: x.userId, vars: varsOf(x), source: "account" }));
    return { recipients: list };
  }
  if (p === "/audience") {
    const b = body(init);
    const e = b.campaignId ? state.get(b.campaignId) : undefined;
    const ex = e ? new Set(e.msgs.map((m) => m.email)) : undefined;
    const presets = { all: audience({ kind: "all" }).count.eligible, learners: audience({ kind: "learners" }).count.eligible, subscribers: audience({ kind: "subscribers" }).count.eligible, never_started: audience({ kind: "never_started" }).count.eligible };
    return { count: audience(b.audience || { kind: "learners" }, ex).count, presets };
  }
  if (p === "/test") {
    const b = body(init);
    const as = PEOPLE.find((x) => x.email === b.asEmail);
    const first = as?.name?.split(" ")[0];
    const subj = first ? String(b.subject || "").replace(/\{\{\s*first_name[^}]*\}\}/g, first) : b.subjectFallback || b.subject;
    return { ok: true, mode: "console", to: b.to || "preview@localhost", as: b.asEmail || "preview@localhost", subject: `[test] ${subj}`, bytes: 16_000 };
  }
  if (p === "/campaigns" && method === "POST") {
    const b = body(init);
    const id = `c0ffee00-0000-4000-8000-${String(100 + seq++).padStart(12, "0")}`;
    const c: Campaign = { ...b, id, status: "draft", sender: null, lastError: null, createdBy: "preview@localhost", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), queuedAt: null, startedAt: null, finishedAt: null, lockUntil: null };
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
        Object.assign(e.c, body(init), { updatedAt: new Date().toISOString() });
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
        case "queue": {
          const { list } = audience(e.c.audience, new Set(e.msgs.map((x) => x.email)));
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
