/**
 * DEV-ONLY mock data for /admin/ai and /admin/chat in the admin preview (`?preview=1`, `next dev`), loaded through
 * shell/fixtures.ts. The call logs' and tables' filters, sorts and facets are applied here the way the server
 * applies them (lib/admin/aiCalls.ts, aiUsers.ts, chatConversations.ts). Deterministic (seeded).
 */
import { CONTENT_FEATURES, FEATURES, FEATURE_IDS, type FeatureId } from "@/lib/ai/features";
import { MODELS, PRICES } from "@/lib/ai/prices";

if (process.env.NODE_ENV !== "development") {
  throw new Error("admin fixtures are dev-only");
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CHAT = ["course-chat", "chat-memory", "chat-title"];
const WINDOWS: Record<string, number> = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, "90d": 90 * DAY, "12m": 365 * DAY };

const USERS = [
  "asha.verma@example.com",
  "rohit.k@example.com",
  "meera.iyer@example.com",
  "dev.sharma@example.com",
  "kabir@example.com",
  "nisha.rao@example.com",
  "arjun.m@example.com",
  "sana.q@example.com",
  "vikram.n@example.com",
  "priya.s@example.com",
  "a.very.long.email.address.for.testing@university.example.edu",
  "tara@example.com",
].map((email, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, email }));

type Row = { id: number; created_at: string; user_id: string | null; email: string | null; feature: string; model: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cost_usd: number; credits: number; latency_ms: number | null; status: string; error: string | null; request_id: string | null; byok: boolean; chat: string | null; rating: number };

// weights: the chat dominates, as in production
const MIX: [FeatureId, number][] = [
  ["course-chat", 30],
  ["chat-title", 8],
  ["chat-memory", 6],
  ["lesson-qa", 12],
  ["lab-hint", 8],
  ["mock-interviewer", 10],
  ["mock-coach", 4],
  ["mock-scorecard", 2],
  ["explain-back", 5],
  ["war-room", 4],
  ["smart-search", 5],
  ["design-review", 2],
  ["eval", 3],
  ["batch", 1],
];
const pickFeature = (x: number): FeatureId => {
  const total = MIX.reduce((a, [, w]) => a + w, 0);
  let t = x * total;
  for (const [f, w] of MIX) if ((t -= w) < 0) return f;
  return "course-chat";
};

const calls: Row[] = (() => {
  const r = rng(42);
  const out: Row[] = [];
  const now = Date.now();
  for (let i = 0; i < 640; i++) {
    const feature = pickFeature(r());
    const system = feature === "eval" || feature === "batch";
    // a few learners use AI much more than the rest; users 9-11 only use the chat
    const u = USERS[Math.floor(r() ** 1.6 * USERS.length)];
    const user = system ? null : feature !== "course-chat" && feature !== "chat-title" && Number(u.id.slice(-2)) >= 9 ? USERS[Math.floor(r() * 8)] : u;
    const model = feature === "chat-title" || feature === "chat-memory" || feature === "war-room" ? MODELS.haiku55 : feature === "batch" ? MODELS.opus : feature === "eval" ? MODELS.haiku : r() < 0.15 ? MODELS.haiku55 : MODELS.sonnet;
    const roll = r();
    const status = roll < 0.86 ? "ok" : roll < 0.9 ? "off_topic" : roll < 0.94 ? "over_quota" : roll < 0.97 ? "rate_limited" : "error";
    const billed = status === "ok" || status === "off_topic";
    const input = billed ? Math.round((feature === "chat-title" ? 300 : feature === "batch" ? 60_000 : 1500) * (0.3 + r() * 2)) : 0;
    const output = billed ? Math.round(FEATURES[feature].maxTokens * (0.15 + r() * 0.8)) : 0;
    const cached = billed && r() < 0.6 ? Math.round(input * (2 + r() * 6)) : 0;
    const p = PRICES[model];
    const cost = billed ? (input * p.input + output * p.output + cached * p.cacheRead) / 1e6 : 0;
    out.push({
      id: 50_000 - i,
      // spread over ~100 days, denser recently
      created_at: new Date(now - r() ** 2.2 * 100 * DAY - i * 1000).toISOString(),
      user_id: user?.id ?? null,
      email: user?.email ?? null,
      feature,
      model,
      input_tokens: input,
      output_tokens: output,
      cache_read_tokens: cached,
      cost_usd: Number(cost.toFixed(6)),
      // since 30 Oct 2026 chat rows carry no credits (the chat's own quota)
      credits: !billed || CHAT.includes(feature) ? 0 : Math.max(1, Math.ceil(cost / 0.001)),
      latency_ms: billed || status === "error" ? Math.round(800 + r() * 9000) : null,
      status,
      error: status === "error" ? "overloaded_error" : status === "ok" || status === "off_topic" ? null : "refused by the fixture",
      request_id: billed ? `req_fx${i}` : null,
      byok: feature === "course-chat" && r() < 0.05,
      chat: feature === "course-chat" && user ? `c${user.id.slice(-2)}x${Math.floor(r() * 6)}` : null,
      rating: feature === "course-chat" ? (r() < 0.08 ? -1 : r() < 0.04 ? -2 : 0) : 0,
    });
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
})();

const isContent = (f: string) => (CONTENT_FEATURES as string[]).includes(f);
const windowMs = (u: URL) => (Number(u.searchParams.get("days")) > 0 ? Number(u.searchParams.get("days")) * DAY : WINDOWS[u.searchParams.get("range") || "30d"] ?? WINDOWS["30d"]);
const inWindow = (u: URL) => {
  const from = Date.now() - windowMs(u);
  const p = u.searchParams;
  const content = p.get("content") === "1";
  const learner = p.get("learner");
  return calls.filter((c) => Date.parse(c.created_at) >= from && (content || !isContent(c.feature)) && (p.get("scope") !== "chat" || CHAT.includes(c.feature)) && (!learner || c.user_id === learner));
};

function callPage(u: URL) {
  const p = u.searchParams;
  const feature = p.get("feature");
  const status = p.get("status");
  const user = p.get("user");
  const sort = p.get("sort") || "new";
  const page = Math.max(1, Number(p.get("page")) || 1);
  let rows = inWindow(u).filter((c) => (!feature || c.feature === feature) && (!status || c.status === status) && (!user || c.user_id === user));
  const m = /^(cost|credits|in|out)\.(asc|desc)$/.exec(sort);
  if (m) {
    const col = ({ cost: "cost_usd", credits: "credits", in: "input_tokens", out: "output_tokens" } as const)[m[1] as "cost"];
    if (m[1] === "credits" && !CHAT.includes(feature || "")) rows = rows.filter((c) => !CHAT.includes(c.feature));
    rows = [...rows].sort((a, b) => (m[2] === "asc" ? a[col] - b[col] : b[col] - a[col]) || b.created_at.localeCompare(a.created_at));
  }
  return { rows: rows.slice((page - 1) * 50, page * 50), total: rows.length, page };
}

function facets(u: URL) {
  const rows = inWindow(u);
  const feature = u.searchParams.get("feature");
  const byFeature = new Map<string, number>();
  for (const c of rows) byFeature.set(c.feature, (byFeature.get(c.feature) ?? 0) + 1);
  const byUser = new Map<string, number>();
  for (const c of rows) if (c.user_id && (!feature || c.feature === feature)) byUser.set(c.user_id, (byUser.get(c.user_id) ?? 0) + 1);
  const p = u.searchParams;
  const from = Date.now() - windowMs(u);
  const hiddenRows = calls.filter((c) => isContent(c.feature) && Date.parse(c.created_at) >= from);
  return {
    contentHidden: p.get("content") !== "1" && !p.get("scope") && !p.get("learner") ? { calls: hiddenRows.length, cost: hiddenRows.filter((c) => c.status === "ok").reduce((a, c) => a + c.cost_usd, 0) } : null,
    features: [...byFeature.entries()].map(([id, n]) => ({ id, label: FEATURES[id as FeatureId]?.label ?? id, calls: n })).sort((a, b) => b.calls - a.calls),
    users: p.get("learner") ? [] : [...byUser.entries()].map(([id, n]) => ({ id, email: USERS.find((x) => x.id === id)?.email ?? null, calls: n })).sort((a, b) => (a.email || "").localeCompare(b.email || "")),
    usersPartial: false,
  };
}

function dashboard() {
  const cycleFrom = Date.now() - 17 * DAY;
  const c = calls.filter((x) => Date.parse(x.created_at) >= cycleFrom);
  const sum = (xs: Row[], k: "cost_usd" | "credits" | "input_tokens" | "output_tokens" | "cache_read_tokens") => xs.reduce((a, x) => a + x[k], 0);
  const group = <K extends string>(key: (x: Row) => K) => {
    const m = new Map<K, Row[]>();
    for (const x of c) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
    return [...m.entries()];
  };
  const today = Date.now() - (Date.now() % DAY);
  return {
    byFeature: group((x) => x.feature).map(([feature, xs]) => ({ feature, calls: xs.filter((x) => x.status === "ok").length, refused: xs.filter((x) => x.status !== "ok").length, cost: sum(xs, "cost_usd"), credits: sum(xs, "credits"), input: sum(xs, "input_tokens"), output: sum(xs, "output_tokens"), cache_read: sum(xs, "cache_read_tokens"), latency: 2400 })),
    byModel: group((x) => x.model).map(([model, xs]) => ({ model, calls: xs.length, cost: sum(xs, "cost_usd"), input: sum(xs, "input_tokens"), output: sum(xs, "output_tokens") })),
    byStatus: Object.fromEntries(group((x) => x.status).map(([k, xs]) => [k, xs.length])),
    daily: group((x) => x.created_at.slice(0, 10))
      .map(([day, xs]) => ({ day, live: sum(xs.filter((x) => x.feature !== "eval" && x.feature !== "batch"), "cost_usd"), content: sum(xs.filter((x) => x.feature === "eval" || x.feature === "batch"), "cost_usd"), calls: xs.length }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    users: group((x) => x.user_id ?? "")
      .filter(([id]) => id)
      .map(([id, xs]) => ({ user_id: id, email: USERS.find((u) => u.id === id)?.email ?? null, calls: xs.length, refused: xs.filter((x) => x.status !== "ok").length, cost: sum(xs, "cost_usd"), credits: sum(xs, "credits"), today: sum(xs.filter((x) => Date.parse(x.created_at) >= today), "cost_usd"), last_at: xs[0].created_at, blocked: false })),
  };
}

const settings = { enabled: true, cycleDay: 13, monthlyBudgetUsd: 450, liveShare: 0.7, userDailyMaxUsd: 0.5, userDailyMinUsd: 0.01, endsOn: "2027-10-10", features: {}, note: null, updatedAt: new Date(Date.now() - 3 * HOUR).toISOString(), updatedBy: "preview@localhost" };

function liveBreakdown() {
  const from = Date.now() - 17 * DAY;
  const rows = calls.filter((c) => Date.parse(c.created_at) >= from && !isContent(c.feature));
  const byModel = new Map<string, { model: string; calls: number; cost: number }>();
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    const m = byModel.get(r.model) ?? { model: r.model, calls: 0, cost: 0 };
    if (r.status === "ok") m.calls++;
    m.cost += r.cost_usd;
    byModel.set(r.model, m);
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }
  return { byModel: [...byModel.values()].sort((a, b) => b.cost - a.cost), byStatus };
}

function usersPage(u: URL) {
  const p = u.searchParams;
  const feature = p.get("feature");
  const user = p.get("user");
  const sort = p.get("sort") || "new";
  const page = Math.max(1, Number(p.get("page")) || 1);
  const today = Date.now() - (Date.now() % DAY);
  const rows = calls.filter((c) => c.user_id && Date.parse(c.created_at) >= Date.now() - 17 * DAY);
  const byFeature = new Map<string, number>();
  const forFeature = new Map<string, number>();
  for (const r of rows) {
    byFeature.set(r.feature, (byFeature.get(r.feature) ?? 0) + 1);
    if (!feature || r.feature === feature) forFeature.set(r.user_id!, (forFeature.get(r.user_id!) ?? 0) + 1);
  }
  const by = new Map<string, { user_id: string; email: string | null; calls: number; refused: number; cost: number; credits: number; tokens: number; today: number; last_at: string; blocked: boolean }>();
  for (const r of rows) {
    if ((feature && r.feature !== feature) || (user && r.user_id !== user)) continue;
    const x = by.get(r.user_id!) ?? { user_id: r.user_id!, email: r.email, calls: 0, refused: 0, cost: 0, credits: 0, tokens: 0, today: 0, last_at: r.created_at, blocked: false };
    if (r.status === "ok") x.calls++;
    else x.refused++;
    x.cost += r.cost_usd;
    if (!CHAT.includes(r.feature)) x.credits += r.credits;
    x.tokens += r.input_tokens + r.output_tokens;
    if (Date.parse(r.created_at) >= today) x.today += r.cost_usd;
    if (r.created_at > x.last_at) x.last_at = r.created_at;
    by.set(r.user_id!, x);
  }
  let list = [...by.values()];
  if (sort === "new") list.sort((a, b) => b.last_at.localeCompare(a.last_at));
  else {
    const [k, dir] = sort.split(".") as ["cost" | "credits" | "tokens", string];
    list = list.sort((a, b) => (a[k] - b[k]) * (dir === "asc" ? 1 : -1));
  }
  return {
    rows: list.slice((page - 1) * 25, page * 25),
    total: list.length,
    page,
    pageSize: 25,
    features: [...byFeature.entries()].map(([id, n]) => ({ id, label: FEATURES[id as FeatureId]?.label ?? id, calls: n })).sort((a, b) => b.calls - a.calls),
    users: [...forFeature.entries()].map(([id, n]) => ({ id, email: USERS.find((x) => x.id === id)?.email ?? null, calls: n })).sort((a, b) => (a.email || "").localeCompare(b.email || "")),
  };
}

function conversations(u: URL) {
  const p = u.searchParams;
  const from = Date.now() - windowMs(u);
  const by = new Map<string, { chat: string; user: string | null; email: string | null; messages: number; first: string; last: string; fast: number; own: number; mode: "main" | "fast" | "own"; cost: number; tokens: number; offTopic: number; down: number; wrong: number }>();
  for (const r of [...calls].reverse()) {
    if (r.feature !== "course-chat" || !r.chat || Date.parse(r.created_at) < from || (r.status !== "ok" && r.status !== "off_topic")) continue;
    const c = by.get(r.chat) ?? { chat: r.chat, user: r.user_id, email: r.email, messages: 0, first: r.created_at, last: r.created_at, fast: 0, own: 0, mode: "main", cost: 0, tokens: 0, offTopic: 0, down: 0, wrong: 0 };
    c.messages++;
    c.last = r.created_at;
    c.cost += r.cost_usd;
    c.tokens += r.input_tokens + r.output_tokens;
    if (r.byok) c.own++;
    else if (/haiku/.test(r.model)) c.fast++;
    if (r.status === "off_topic") c.offTopic++;
    if (r.rating === -1) c.down++;
    if (r.rating === -2) c.wrong++;
    by.set(r.chat, c);
  }
  const all = [...by.values()].map((c) => ({ ...c, mode: (c.own ? "own" : c.fast ? "fast" : "main") as "main" | "fast" | "own" }));
  const outcome = p.get("outcome");
  let list = all.filter((c) => (!p.get("user") || c.user === p.get("user")) && (!p.get("mode") || c.mode === p.get("mode")) && (!outcome || (outcome === "off_topic" ? c.offTopic : outcome === "down" ? c.down : c.wrong) > 0));
  const sort = p.get("sort") || "new";
  if (sort === "new") list.sort((a, b) => b.last.localeCompare(a.last));
  else if (sort === "old") list.sort((a, b) => a.first.localeCompare(b.first));
  else {
    const [k, dir] = sort.split(".") as ["messages" | "cost" | "tokens", string];
    list = list.sort((a, b) => (a[k] - b[k]) * (dir === "asc" ? 1 : -1));
  }
  const page = Math.max(1, Number(p.get("page")) || 1);
  const n = new Map<string, number>();
  for (const c of all) if (c.user) n.set(c.user, (n.get(c.user) ?? 0) + 1);
  return {
    rows: list.slice((page - 1) * 25, page * 25),
    total: list.length,
    page,
    pageSize: 25,
    users: [...n.entries()].map(([id, k]) => ({ id, email: USERS.find((x) => x.id === id)?.email ?? null, calls: k })).sort((a, b) => (a.email || "").localeCompare(b.email || "")),
    feedback: true,
    partial: false,
  };
}

function chatDashboard(u: URL) {
  const days = Number(u.searchParams.get("days")) || 14;
  const from = Date.now() - days * DAY;
  const rows = calls.filter((c) => CHAT.includes(c.feature) && Date.parse(c.created_at) >= from);
  const msgs = rows.filter((r) => r.feature === "course-chat" && (r.status === "ok" || r.status === "off_topic"));
  const daily = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * DAY).toISOString().slice(0, 10);
    const d = msgs.filter((m) => m.created_at.startsWith(day));
    return { day, messages: d.length, users: new Set(d.map((m) => m.user_id)).size, sonnet: d.filter((m) => !/haiku/.test(m.model)).length, fast: d.filter((m) => /haiku/.test(m.model)).length, cost: d.reduce((a, m) => a + m.cost_usd, 0), memoryCost: 0.002, titleCost: 0.001, avgTools: 1.4, avgLatency: 5200, offTopic: d.filter((m) => m.status === "off_topic").length, refused: 0, errors: 0 };
  });
  const cost = msgs.reduce((a, m) => a + m.cost_usd, 0);
  const fast = msgs.filter((m) => /haiku/.test(m.model)).length;
  return {
    settings: { masterOn: true, enabled: true, perDay: 30, ceiling: 300, model: MODELS.sonnet, features: {} },
    days,
    daily,
    totals: { messages: msgs.length, users: new Set(msgs.map((m) => m.user_id)).size, sonnet: msgs.length - fast, fast, cost, memoryCost: 0.03, titleCost: 0.01, offTopic: msgs.filter((m) => m.status === "off_topic").length, refused: 3, errors: 1, avgTools: 1.4, avgRounds: 1.8, p50: 4200, p95: 11800, quizzes: 6, graded: 4, paths: 3, saved: 2, memoryUsers: 7 },
    topics: [{ topic: "Consistent hashing", n: 9 }, { topic: "Rate limiting", n: 6 }, { topic: "Kafka partitions", n: 4 }],
    tools: [{ tool: "search_course", n: 40 }, { tool: "lesson_section", n: 18 }],
    feedback: { up: 21, down: 4, wrong: 2, worst: [] },
    gaps: [{ q: "vector clocks", n: 2 }],
  };
}

/** /api/admin/ai/*: mock data (the course-chat admin too). */
export function resolveAiFixture(u: URL, init?: RequestInit): unknown {
  if ((init?.method || "GET").toUpperCase() !== "GET") return { ok: true };
  switch (u.pathname) {
    case "/api/admin/ai":
      return {
        keyConfigured: true,
        settings: { ...settings, liveShare: 0.85 },
        budget: { mode: "green", reason: "spending on pace", cycle: { start: new Date(Date.now() - 17 * DAY).toISOString(), end: new Date(Date.now() + 13 * DAY).toISOString(), daysLeft: 13 }, monthlyBudget: 450, liveBudget: 382.5, contentBudget: 67.5, spentCycle: 55.4, spentCycleLive: 1.38, spentCycleContent: 54.02, spentToday: 0.41, todayBudget: 29.3, activeUsers: 9, userDailyUsd: 0.5, userDailyCredits: 500 },
        dashboard: dashboard(),
        live: liveBreakdown(),
        features: FEATURE_IDS.map((id) => ({ id, label: FEATURES[id].label, enabled: true, model: FEATURES[id].model, defaultModel: FEATURES[id].model, perDay: FEATURES[id].perDay, live: FEATURES[id].live, maxTokens: FEATURES[id].maxTokens, content: FEATURES[id].kind === "content" })),
        models: Object.values(MODELS).map((id) => ({ id, price: PRICES[id] })),
      };
    case "/api/admin/ai/limits":
      return { shared: { credits: 500, ceiling: 500 }, limits: [] };
    case "/api/admin/ai/calls":
      return callPage(u);
    case "/api/admin/ai/calls/facets":
      return facets(u);
    case "/api/admin/ai/users":
      return usersPage(u);
    case "/api/admin/ai/chat":
      if (u.searchParams.get("view") === "conversations") return conversations(u);
      if (u.searchParams.get("chat")) return { messages: [] };
      return chatDashboard(u);
    case "/api/admin/ai/transcript":
      return { transcript: null };
    default:
      return undefined;
  }
}
