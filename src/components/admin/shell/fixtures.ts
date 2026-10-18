/**
 * DEV-ONLY mock data for the /admin preview (`?preview=1` with NODE_ENV=development).
 * Loaded through a dynamic import that sits behind a `process.env.NODE_ENV === "development"`
 * check, so production bundles never include it. Deterministic (seeded) for stable screenshots.
 */
import type {
  AdminComment,
  AdminUserRow,
  ContactQuery,
  LearnersSummary,
  SendLog,
  StoryLite,
  StoryStat,
  Subscriber,
  TrafficLive,
  TrafficOverview,
} from "./types";
import { resolveLearnFixture, resolveLearnFixtureText } from "@/components/admin/learners/fixtures";
import { resolveNewsletterFixture, resolveNewsletterFixtureText } from "@/components/admin/newsletter/fixtures";
import { resolveJourneysFixture, resolveJourneysFixtureText } from "@/components/admin/journeys/fixtures";

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

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const RANGE_POINTS: Record<string, { n: number; step: number }> = {
  "24h": { n: 24, step: HOUR },
  "7d": { n: 7, step: DAY },
  "30d": { n: 30, step: DAY },
  "90d": { n: 13, step: 7 * DAY },
  "12m": { n: 12, step: 30 * DAY },
};

function trafficOverview(range: string): TrafficOverview {
  const { n, step } = RANGE_POINTS[range] || RANGE_POINTS["7d"];
  const r = rng(n * 7);
  const scale = step / DAY;
  const series = Array.from({ length: n }, (_, i) => {
    const wave = 1 + 0.35 * Math.sin(i / 2.2) + i / (n * 2.5);
    const visitors = Math.round((38 + r() * 24) * wave * Math.max(scale, 0.12));
    const sessions = Math.round(visitors * (1.15 + r() * 0.2));
    const pageviews = Math.round(sessions * (2.1 + r() * 0.9));
    return { t: new Date(Date.now() - (n - 1 - i) * step).toISOString(), visitors, pageviews, sessions };
  });
  const sum = (k: "visitors" | "pageviews" | "sessions") => series.reduce((a, p) => a + p[k], 0);
  return {
    kpis: {
      visitors: sum("visitors"),
      pageviews: sum("pageviews"),
      sessions: sum("sessions"),
      bounceRate: 0.412,
      avgEngagedSec: 134,
      newPct: 0.68,
      signedIn: 23,
      live: 4,
      prev: {
        visitors: Math.round(sum("visitors") * 0.86),
        pageviews: Math.round(sum("pageviews") * 0.93),
        sessions: Math.round(sum("sessions") * 0.9),
        bounceRate: 0.448,
        avgEngagedSec: 121,
        newPct: 0.71,
        signedIn: 19,
        live: 0,
      },
    },
    series,
  };
}

const trafficLive: TrafficLive = {
  live: 4,
  pages: [
    { path: "/learn/system-design-mastery/week-03/consistent-hashing", n: 2 },
    { path: "/", n: 1 },
    { path: "/stories/the-night-the-queue-froze", n: 1 },
  ],
  recent: [
    { at: ago(0.4 * MIN), path: "/learn/system-design-mastery/week-03/consistent-hashing", country: "IN", city: "Bengaluru", device: "desktop", channel: "Direct" },
    { at: ago(1.2 * MIN), path: "/", country: "US", city: "Seattle", device: "mobile", channel: "Social" },
    { at: ago(3 * MIN), path: "/stories/the-night-the-queue-froze", country: "DE", city: "Berlin", device: "desktop", channel: "Search" },
  ],
};

const NAMES = ["Aarav Mehta", "Priya Nair", "Rohan Gupta", "Sara Iqbal", "Kabir Singh", "Ananya Rao", "Dev Patel", "Meera Joshi", "Ishaan Verma", "Tara Kapoor", "Neil D'Souza", "Zoya Khan"];
const LESSONS = [
  { week: "week-01", lesson: "back-of-the-envelope", title: "Back-of-the-envelope estimation" },
  { week: "week-02", lesson: "caching-patterns", title: "Caching patterns that survive prod" },
  { week: "week-03", lesson: "consistent-hashing", title: "Consistent hashing" },
  { week: "week-04", lesson: "message-queues", title: "Message queues and backpressure" },
  { week: "week-05", lesson: "rate-limiting", title: "Rate limiting at the edge" },
  { week: "week-06", lesson: "sharding", title: "Sharding without tears" },
];
const STAGES = ["Hook", "Mental model", "Deep dive", "Trade-offs", "Boss fight"];

function learnersSummary(): LearnersSummary {
  const r = rng(42);
  return {
    learners: 187,
    guests: 412,
    activeToday: 14,
    active7d: 61,
    lessonsCompleted: 932,
    stagesDone: 3518,
    avgMinutesPerLearner: 47,
    topLessons: LESSONS.map((l, i) => ({
      course: "system-design-mastery",
      ...l,
      readers: Math.round(140 - i * 17 + r() * 10),
      completions: Math.round(90 - i * 13 + r() * 8),
    })),
    recent: NAMES.slice(0, 8).map((name, i) => {
      const l = LESSONS[(i * 5) % LESSONS.length];
      return {
        userId: `u-${i + 1}`,
        name,
        email: `${name.split(" ")[0].toLowerCase()}@example.com`,
        lesson: `${l.week}/${l.lesson}`,
        title: l.title,
        stage: STAGES[(i * 3) % STAGES.length],
        at: ago((i * i + 1) * 4 * MIN),
      };
    }),
  };
}

const CITIES: [string, string, string, string][] = [
  ["Bengaluru", "Karnataka", "IN", "Asia/Kolkata"],
  ["Pune", "Maharashtra", "IN", "Asia/Kolkata"],
  ["Berlin", "Berlin", "DE", "Europe/Berlin"],
  ["Austin", "Texas", "US", "America/Chicago"],
  ["London", "England", "GB", "Europe/London"],
  ["Singapore", "", "SG", "Asia/Singapore"],
];

const subscribers: Subscriber[] = Array.from({ length: 34 }, (_, i) => {
  const c = CITIES[i % CITIES.length];
  const unsub = i % 9 === 4;
  const first = NAMES[i % NAMES.length].split(" ")[0].toLowerCase();
  return {
    email: `${first}${i > 11 ? i : ""}@${["gmail.com", "outlook.com", "proton.me", "company.dev"][i % 4]}`,
    created_at: ago(i * 2.7 * DAY + i * 37 * MIN),
    city: c[0],
    region: c[1] || null,
    country: c[2],
    timezone: c[3],
    unsubscribed: unsub,
    unsubscribed_at: unsub ? ago(i * DAY) : null,
  };
});

const contactQueries: ContactQuery[] = [
  { id: "q1", name: "Sara Iqbal", email: "sara@company.dev", message: "Hi Himanshu — we're hiring a staff engineer for our realtime infra team. Would you be open to a quick chat next week?", status: "new", created_at: ago(2 * HOUR) },
  { id: "q2", name: "Rohan", email: "rohan@gmail.com", message: "Loved the consistent hashing lesson. Is there a part 2 on rendezvous hashing? <script>alert('x')</script> (this tag must render as text)", status: "new", created_at: ago(9 * HOUR) },
  { id: "q3", name: "Meera Joshi", email: "meera@outlook.com", message: "Can I use the case files in my team's onboarding docs? Happy to credit.", status: "replied", created_at: ago(2 * DAY) },
  { id: "q4", name: "Kabir", email: "kabir@proton.me", message: "Found a typo in week 4: 'backpresure'.", status: "resolved", created_at: ago(6 * DAY) },
];

const logs: SendLog[] = Array.from({ length: 18 }, (_, i) => ({
  email: subscribers[i % subscribers.length].email,
  status: i % 7 === 3 ? "failed" : "sent",
  detail: i % 7 === 3 ? "550 mailbox unavailable" : null,
  created_at: ago(Math.floor(i / 6) * 7 * DAY + i * MIN),
  campaign_id: 12 - Math.floor(i / 6),
}));

const users: AdminUserRow[] = NAMES.map((name, i) => ({
  id: `u-${i + 1}`,
  email: `${name.split(" ")[0].toLowerCase()}@example.com`,
  name,
  avatar: null,
  createdAt: ago((i * 9 + 2) * DAY),
  lastSignInAt: i % 5 === 4 ? null : ago((i * i + 1) * 3 * HOUR),
  lastSeenAt: ago((i + 1) * 5 * HOUR),
  confirmed: i % 6 !== 5,
  providers: i % 3 === 0 ? ["email"] : ["google"],
  lessonsCompleted: Math.max(0, 24 - i * 2),
  currentStreak: i % 4,
}));

const comments: AdminComment[] = [
  { kind: "lesson", id: "c1", userId: "u-2", name: "Priya Nair", text: "The ring diagram finally made virtual nodes click for me. Could you add a note on how many vnodes Cassandra uses by default?", where: "week-03/consistent-hashing", href: "/learn/system-design-mastery/week-03/consistent-hashing", parentId: null, upvotes: 6, createdAt: ago(3 * HOUR) },
  { kind: "lesson", id: "c2", userId: "u-5", name: "Kabir Singh", text: "<img src=x onerror=alert(1)> spam spam buy followers", where: "week-02/caching-patterns", href: "/learn/system-design-mastery/week-02/caching-patterns", parentId: null, upvotes: 0, createdAt: ago(7 * HOUR) },
  { kind: "story", id: "c3", userId: "u-7", name: "Dev Patel", text: "We hit exactly this with RabbitMQ prefetch last year. Great write-up.", where: "stories/the-night-the-queue-froze", href: "/stories/the-night-the-queue-froze", parentId: null, upvotes: 3, createdAt: ago(1.5 * DAY) },
  { kind: "lesson", id: "c4", userId: "u-3", name: "Rohan Gupta", text: "+1, same question.", where: "week-03/consistent-hashing", href: "/learn/system-design-mastery/week-03/consistent-hashing", parentId: "c1", upvotes: 1, createdAt: ago(2 * DAY) },
];

const stories: StoryLite[] = [
  { slug: "the-night-the-queue-froze", title: "The night the queue froze", excerpt: "A prefetch setting, a retry storm and 40 minutes of silence.", date: "2026-09-02" },
  { slug: "streaming-devices-to-browsers", title: "Streaming real devices to a browser tab", excerpt: "WebRTC, H.264 and the 80 ms budget.", date: "2026-07-18" },
  { slug: "the-cache-that-lied", title: "The cache that lied", excerpt: "Stale reads after a deploy, and the TTL that hid it.", date: "2026-05-30" },
  { slug: "one-index-to-rule-them", title: "One index to rule them all", excerpt: "How a composite index cut p95 from 2s to 40ms.", date: "2026-03-11" },
];

const storyStats: StoryStat[] = stories.map((s, i) => ({
  slug: s.slug,
  title: s.title,
  date: s.date ?? null,
  totalViews: 1800 - i * 390,
  uniqueVisitors: 1210 - i * 260,
  newVisitors30d: 240 - i * 55,
  lastViewedAt: ago((i + 1) * 2 * HOUR),
}));

export const PREVIEW_EMAIL_HTML = `<!doctype html><html><body style="margin:0;background:#f5f4f0;font-family:system-ui,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #ddd;padding:28px">
<div style="font:600 12px ui-monospace,monospace;color:#c2410c;letter-spacing:.08em;text-transform:uppercase">Latest from Himanshu Kukreja</div>
<h1 style="font-size:26px;margin:8px 0 16px">Your weekly dose of engineering stories</h1>
${stories.map((s) => `<div style="border-top:1px solid #eee;padding:14px 0"><b>${s.title}</b><p style="color:#555;margin:6px 0 0">${s.excerpt}</p></div>`).join("")}
<p style="color:#888;font-size:12px;margin-top:20px">Preview fixture · sent to preview@example.com</p></div></body></html>`;

/** Resolve a GET to mock data; writes (non-GET) succeed. Unknown URLs → undefined (falls through). */
export function resolveFixture(url: string, init?: RequestInit): unknown {
  const u = new URL(url, "http://x");
  // case files: no mock data, the dev JSON store answers (CASE_FILES_STORE=file, see lib/case-files/api.ts)
  if (u.pathname.startsWith("/api/admin/case-files")) return undefined;
  // design of the week: the dev in-memory store answers (DOW_FIXTURES=1, see lib/design-week/api.ts)
  if (u.pathname.startsWith("/api/admin/design-week")) return undefined;
  if (u.pathname.startsWith("/api/admin/newsletter")) return resolveNewsletterFixture(u, init);
  if (u.pathname.startsWith("/api/admin/posthog/")) return resolveJourneysFixture(u, init);
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET") return { ok: true, sent: 3, total: 3 };
  const range = u.searchParams.get("range") || "7d";
  switch (u.pathname) {
    case "/api/admin/me":
      return { email: "preview@localhost" };
    case "/api/admin/traffic/overview":
      return trafficOverview(range);
    case "/api/admin/traffic/live":
      return trafficLive;
    case "/api/admin/learners/summary":
      return learnersSummary();
    case "/api/admin/subscribers":
      return subscribers;
    case "/api/admin/contact-queries":
      return contactQueries;
    case "/api/admin/logs":
      return logs;
    case "/api/admin/users":
      return { users, total: users.length };
    case "/api/admin/comments":
      return { comments, errors: [] };
    case "/api/admin/stories":
      return {
        stories: storyStats,
        totals: {
          views: storyStats.reduce((a, s) => a + s.totalViews, 0),
          unique: storyStats.reduce((a, s) => a + s.uniqueVisitors, 0),
          new30d: storyStats.reduce((a, s) => a + s.newVisitors30d, 0),
        },
      };
    case "/api/stories":
      return { stories };
    default:
      return resolveLearnFixture(u);
  }
}

/** Text endpoints (email preview HTML, CSV export). */
export function resolveFixtureText(url: string): string | undefined {
  const path = new URL(url, "http://x").pathname;
  if (path.startsWith("/api/admin/newsletter")) return resolveNewsletterFixtureText(new URL(url, "http://x"));
  if (path.startsWith("/api/admin/posthog/")) return resolveJourneysFixtureText(new URL(url, "http://x"));
  if (path === "/api/admin/preview-email") return PREVIEW_EMAIL_HTML;
  if (path === "/api/admin/export-csv")
    return ["Email,Subscribed Date,Status,City,Country", ...subscribers.map((s) => `"${s.email}","${s.created_at}","${s.unsubscribed ? "Unsubscribed" : "Active"}","${s.city}","${s.country}"`)].join("\n");
  return resolveLearnFixtureText(new URL(url, "http://x"));
}
