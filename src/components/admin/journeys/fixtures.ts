/**
 * DEV-ONLY mock data for /admin/journeys in the admin preview (`?preview=1`). Wired from
 * ../shell/fixtures.ts, which production bundles never load. Deterministic (seeded).
 * Add `&setup=1` to the page URL to preview the "not configured" setup card instead.
 */
import type { EmbedRes, LiveFeedRes, LiveFilter, LiveRes, LiveSession, LiveWindow, NotConfigured, PageDetailRes, PathsRes, PeopleRes, PersonRes, PersonRow, PhStatus, Recording, RecordingsRes, StreamEvent, TimelineEvent } from "@/lib/analytics/journeys";
import { computePaths, describe, type PathRow, type Props, type TitleOf } from "@/lib/analytics/journeysModel";
import { replayFixtureChunk, replayFixtureSources } from "./replayFixture";

if (process.env.NODE_ENV !== "development") {
  throw new Error("journeys fixtures are dev-only");
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const C = "system-design-mastery";

const LESSONS: [week: string, slug: string, title: string][] = [
  ["week-00-foundations", "foundations-part-1-basic-concepts", "System Design Fundamentals"],
  ["week-00-foundations", "foundations-part-2-infrastructure-building-blocks", "Infrastructure Building Blocks"],
  ["week-01-data-at-scale", "day-01-partitioning-deep-dive", "Partitioning Deep-Dive"],
  ["week-01-data-at-scale", "day-02-replication-tradeoffs", "Replication Trade-offs"],
  ["week-02-failure-first-design", "day-03-circuit-breakers", "Circuit Breakers"],
  ["week-04-caching", "day-03-thundering-herd", "Thundering Herd"],
];
const STORIES: [slug: string, title: string][] = [
  ["the-night-the-queue-froze", "The night the queue froze"],
  ["the-cache-that-lied", "The cache that lied"],
];
const TITLES = new Map<string, string>([
  ["/", "Home"],
  ["/learn", "Learn hub"],
  ["/stories", "Case files"],
  ["/play", "Arcade"],
  ["/learn/dashboard", "Learn · progress"],
  ...LESSONS.map(([w, s, t]) => [`/learn/${C}/${w}/${s}`, t] as [string, string]),
  ...STORIES.map(([s, t]) => [`/stories/${s}`, t] as [string, string]),
]);
const titleOf: TitleOf = (p) => (p ? (TITLES.get(p) ?? null) : null);
const lessonPath = (i: number) => `/learn/${C}/${LESSONS[i][0]}/${LESSONS[i][1]}`;

const hex = (r: () => number, n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("");
const uuid = (r: () => number) => `${hex(r, 8)}-${hex(r, 4)}-7${hex(r, 3)}-a${hex(r, 3)}-${hex(r, 12)}`;

/* ───────────────────────────── people ───────────────────────────── */

const NAMES: [email: string | null, name: string | null, city: string, country: string, device: string, browser: string, os: string, ref: string | null][] = [
  ["aarav.mehta@example.com", "Aarav Mehta", "Bengaluru", "IN", "Desktop", "Chrome", "Mac OS X", "linkedin.com"],
  ["priya.n@example.com", "Priya Nair", "Pune", "IN", "Mobile", "Mobile Safari", "iOS", "google.com"],
  [null, null, "Hyderabad", "IN", "Desktop", "Chrome", "Windows", "google.com"],
  ["dev.kapoor@example.com", "Dev Kapoor", "Delhi", "IN", "Desktop", "Firefox", "Linux", "$direct"],
  [null, null, "San Francisco", "US", "Desktop", "Chrome", "Mac OS X", "news.ycombinator.com"],
  [null, null, "Mumbai", "IN", "Mobile", "Chrome", "Android", "t.co"],
  ["sara.k@example.com", "Sara Khan", "London", "GB", "Desktop", "Safari", "Mac OS X", "chatgpt.com"],
  [null, null, "Berlin", "DE", "Desktop", "Chrome", "Windows", "google.com"],
  [null, null, "Chennai", "IN", "Mobile", "Chrome", "Android", "$direct"],
  ["rohit.verma@example.com", null, "Noida", "IN", "Tablet", "Mobile Safari", "iOS", "linkedin.com"],
  [null, null, "Toronto", "CA", "Desktop", "Edge", "Windows", "bing.com"],
  [null, null, "Kolkata", "IN", "Mobile", "Samsung Internet", "Android", "$direct"],
  [null, null, "Singapore", "SG", "Desktop", "Chrome", "Mac OS X", "google.com"],
  ["meera.iyer@example.com", "Meera Iyer", "Kochi", "IN", "Desktop", "Chrome", "Windows", "google.com"],
];

const r0 = rng(42);
const PEOPLE: PersonRow[] = NAMES.map(([email, name, city, country, device, browser, os, ref], i) => {
  const id = uuid(r0);
  const lastSeen = new Date(Date.now() - (i * i * 37 + 4) * MIN).toISOString();
  return {
    id,
    distinctId: email ? uuid(r0) : `019${hex(r0, 5)}-${hex(r0, 4)}-7${hex(r0, 3)}-a${hex(r0, 3)}-${hex(r0, 12)}`,
    email,
    name,
    identified: !!email,
    firstSeen: new Date(Date.now() - (3 + i * 2.3) * DAY).toISOString(),
    lastSeen,
    sessions: Math.max(1, 14 - i + Math.floor(r0() * 4)),
    pageviews: Math.max(2, 120 - i * 8 + Math.floor(r0() * 20)),
    events: Math.max(5, 600 - i * 40),
    country,
    city,
    device,
    browser,
    os,
    referrer: ref === "$direct" ? "direct" : ref,
    topPages: [lessonPath(i % LESSONS.length), "/learn", i % 3 ? "/" : `/stories/${STORIES[0][0]}`],
  };
});

/* ───────────────────────────── one person's journey ───────────────────────────── */

type Raw = { event: string; props: Props; chain?: string };

function sessionScript(r: () => number, li: number, signIn: boolean): Raw[] {
  const lp = lessonPath(li);
  const [week, slug] = LESSONS[li];
  const L = { course: C, week, lesson: slug };
  const out: Raw[] = [
    { event: "$pageview", props: { $pathname: "/" } },
    { event: "$autocapture", props: { $pathname: "/", $event_type: "click", $el_text: "Start the course" }, chain: 'a.btn:text="Start the course"attr__href="/learn"' },
    { event: "$pageview", props: { $pathname: "/learn" } },
  ];
  if (signIn) out.push({ event: "signed_in", props: { $pathname: "/learn", provider: "google" } });
  out.push(
    { event: "$autocapture", props: { $pathname: "/learn", $event_type: "click", $el_text: LESSONS[li][2] }, chain: `a:text="${LESSONS[li][2]}"attr__href="${lp}"` },
    { event: "$pageview", props: { $pathname: lp } },
    { event: "lesson_open", props: { $pathname: lp, ...L, stage: "intro" } },
    { event: "read_progress", props: { $pathname: lp, content_type: "lesson", ...L, pct: 25 } },
    { event: "stage_done", props: { $pathname: lp, ...L, stage: "intro", index: 0, total: 5 } },
    { event: "quiz_answer", props: { $pathname: lp, ...L, q: 1, correct: true, first: true } },
    { event: "quiz_answer", props: { $pathname: lp, ...L, q: 2, correct: r() > 0.5, first: true } },
    { event: "read_progress", props: { $pathname: lp, content_type: "lesson", ...L, pct: 50 } },
    { event: "ask_ai", props: { $pathname: lp, client: "chatgpt", kind: "paragraph", chars: 412 } }
  );
  if (r() > 0.6) out.push({ event: "$rageclick", props: { $pathname: lp, $el_text: "Mark complete" }, chain: 'button.cta:text="Mark complete"' });
  out.push(
    { event: "stage_done", props: { $pathname: lp, ...L, stage: "deep-dive", index: 1, total: 5 } },
    { event: "read_progress", props: { $pathname: lp, content_type: "lesson", ...L, pct: 75 } },
    { event: "share_link", props: { $pathname: lp, kind: "section", channel: "copy" } }
  );
  if (r() > 0.4)
    out.push(
      { event: "read_progress", props: { $pathname: lp, content_type: "lesson", ...L, pct: 100 } },
      { event: "lesson_complete", props: { $pathname: lp, ...L, minutes: 34 } }
    );
  return out;
}

const SESSIONS_BY_PERSON = new Map<string, { id: string; start: number; events: TimelineEvent[] }[]>();

function personSessions(p: PersonRow) {
  const hit = SESSIONS_BY_PERSON.get(p.id);
  if (hit) return hit;
  const r = rng(p.id.charCodeAt(0) * 31 + p.id.charCodeAt(3));
  const n = Math.min(5, Math.max(2, p.sessions % 6));
  const sessions: { id: string; start: number; events: TimelineEvent[] }[] = [];
  let t = new Date(p.lastSeen).getTime();
  for (let s = 0; s < n; s++) {
    const id = uuid(r);
    const script = sessionScript(r, (s + PEOPLE.indexOf(p)) % LESSONS.length, s === n - 1 && p.identified);
    const start = t - script.length * 2.4 * MIN;
    let at = start;
    const events: TimelineEvent[] = script.map((ev, k) => {
      const d = describe(ev.event, ev.props, ev.chain || null, titleOf);
      at += (k ? 1 + r() * 2.2 : 0) * MIN;
      return {
        id: `${id}-${k}`,
        t: new Date(at).toISOString(),
        event: ev.event,
        kind: d.kind,
        label: d.label,
        detail: d.detail,
        path: (ev.props.$pathname as string) || null,
        session: id,
      };
    });
    sessions.push({ id, start, events });
    t = start - (s % 2 ? 0.6 : 1.3) * DAY;
  }
  SESSIONS_BY_PERSON.set(p.id, sessions);
  return sessions;
}

function recordingFor(p: PersonRow, s: { id: string; start: number; events: TimelineEvent[] }, i: number): Recording {
  const last = new Date(s.events[s.events.length - 1].t).getTime();
  const pages = [...new Set(s.events.filter((e) => e.kind === "pageview").map((e) => e.path!))];
  return {
    id: s.id,
    start: new Date(s.start).toISOString(),
    end: new Date(last).toISOString(),
    duration: Math.round((last - s.start) / 1000) + 40,
    active: Math.round(((last - s.start) / 1000) * 0.62),
    clicks: 6 + (i % 5) * 3,
    keys: i % 3 ? 0 : 14,
    errors: i === 2 ? 1 : 0,
    startUrl: "/",
    personId: p.id,
    who: p.email || p.name || `anon ${p.distinctId.slice(-6)}`,
    identified: p.identified,
    ongoing: i === 0 && Date.now() - last < 10 * MIN,
    viewed: i > 1,
    pages,
    pageviews: pages.length + 1,
    rage: s.events.filter((e) => e.event === "$rageclick").length,
    dead: i === 3 ? 2 : 0,
  };
}

function personRes(id: string, days: number): PersonRes | null {
  const p = PEOPLE.find((x) => x.id === id || x.distinctId === id) || PEOPLE[0];
  const sessions = personSessions(p);
  const events = sessions.flatMap((s) => s.events).sort((a, b) => (a.t < b.t ? 1 : -1));
  // the oldest session has no replay (e.g. too short / expired)
  const recordings = sessions.slice(0, -1).map((s, i) => recordingFor(p, s, i));
  return {
    configured: true,
    person: {
      id: p.id,
      distinctId: p.distinctId,
      email: p.email,
      name: p.name,
      identified: p.identified,
      createdAt: p.firstSeen,
      country: p.country,
      city: p.city,
      device: p.device,
      browser: p.browser,
      os: p.os,
      referrer: p.referrer,
      appUrl: "https://us.posthog.com/project/12345/person/preview",
    },
    events,
    recordings,
    recordingsError: null,
    days,
    truncated: false,
  };
}

/* ───────────────────────────── other screens ───────────────────────────── */

const ALL_RECORDINGS: Recording[] = PEOPLE.slice(0, 9)
  .flatMap((p) => personSessions(p).slice(0, 2).map((s, i) => recordingFor(p, s, i)))
  .sort((a, b) => (a.start < b.start ? 1 : -1));

function live(): LiveRes {
  const events: StreamEvent[] = PEOPLE.slice(0, 6)
    .flatMap((p) =>
      personSessions(p)[0].events.slice(-6).map((e) => ({
        id: e.id,
        t: e.t,
        event: e.event,
        label: e.label,
        kind: e.kind,
        path: e.path,
        title: titleOf(e.path),
        personId: p.id,
        who: p.email || p.name || `anon ${p.distinctId.slice(-6)}`,
        identified: p.identified,
        country: p.country,
        city: p.city,
        device: p.device,
        session: e.session,
      }))
    )
    .sort((a, b) => (a.t < b.t ? 1 : -1))
    .slice(0, 40);
  return {
    configured: true,
    live: 3,
    pages: [
      { path: lessonPath(2), title: titleOf(lessonPath(2)), n: 2 },
      { path: "/learn", title: "Learn hub", n: 1 },
    ],
    events,
  };
}

/** /admin/live: sessions re-timed so a few are live right now, older ones spread over the week. */
const LIVE_AGO_MIN = [0.4, 1.5, 3.2, 8, 14, 22, 41, 75, 140, 260, 520, 900, 1500, 2600, 4300, 7000, 9100];

function liveSessions(): LiveSession[] {
  const out: LiveSession[] = [];
  let k = 0;
  for (let round = 0; round < 2; round++) {
    PEOPLE.forEach((p, i) => {
      if (round === 1 && i > 3) return;
      const s = personSessions(p)[round];
      // seeded ids can repeat across fixture people: keep each session id once
      if (!s || k >= LIVE_AGO_MIN.length || out.some((o) => o.id === s.id)) return;
      const ago = LIVE_AGO_MIN[k++];
      const last0 = new Date(s.events[s.events.length - 1].t).getTime();
      const shift = Date.now() - ago * MIN - last0;
      const evs = s.events.map((e) => ({ id: e.id, t: new Date(new Date(e.t).getTime() + shift).toISOString(), event: e.event, kind: e.kind, label: e.label, detail: e.detail, path: e.path }));
      const pages = evs.filter((e) => e.kind === "pageview" && e.path);
      const start = evs[0].t;
      const last = evs[evs.length - 1].t;
      const dur = Math.round((new Date(last).getTime() - new Date(start).getTime()) / 1000);
      const entry = pages[0]?.path ?? null;
      const cur = pages[pages.length - 1]?.path ?? null;
      const hasRec = k % 5 !== 3;
      out.push({
        id: s.id,
        personId: p.id,
        who: p.email || p.name || `anon ${p.distinctId.slice(-6)}`,
        identified: p.identified,
        start,
        last,
        duration: dur,
        events: evs.length,
        pageviews: pages.length,
        entry: entry ? { path: entry, title: titleOf(entry) } : null,
        current: cur ? { path: cur, title: titleOf(cur) } : null,
        country: p.country,
        city: p.city,
        device: p.device,
        browser: p.browser,
        os: p.os,
        referrer: p.referrer,
        active: ago < 5,
        recording: hasRec ? { id: s.id, duration: dur + 40, active: Math.round(dur * 0.6), ongoing: ago < 2 } : null,
        timeline: evs,
      });
    });
  }
  return out.sort((a, b) => (a.last < b.last ? 1 : -1));
}

function liveFeed(u: URL): LiveFeedRes {
  const w = (["30m", "24h", "7d"].includes(u.searchParams.get("window") || "") ? u.searchParams.get("window") : "24h") as LiveWindow;
  const f = (["all", "signed", "learn", "recorded"].includes(u.searchParams.get("filter") || "") ? u.searchParams.get("filter") : "all") as LiveFilter;
  const before = u.searchParams.get("before");
  const span = { "30m": 30 * MIN, "24h": DAY, "7d": 7 * DAY }[w];
  const all = liveSessions().filter(
    (s) =>
      Date.now() - new Date(s.last).getTime() < span &&
      (f === "signed" ? s.identified : f === "learn" ? s.timeline.some((e) => e.path?.startsWith("/learn")) : f === "recorded" ? !!s.recording : true)
  );
  const page = all.filter((s) => !before || s.last < before);
  const r = rng(Math.floor(Date.now() / 15_000));
  return {
    configured: true,
    window: w,
    filter: f,
    generatedAt: new Date().toISOString(),
    stats: { online: all.filter((s) => s.active).length, sessionsToday: 23 + Math.floor(r() * 3), peopleToday: 17, eventsHour: 180 + Math.floor(r() * 40) },
    perMinute: Array.from({ length: 30 }, (_, i) => Math.round(3 + 4 * Math.sin(i / 4) + r() * 6 + (i > 24 ? 6 : 0))),
    pages: [
      { path: lessonPath(2), title: titleOf(lessonPath(2)), n: 2 },
      { path: "/learn", title: "Learn hub", n: 1 },
    ],
    sessions: page.slice(0, 10),
    hasMore: page.length > 10,
    recordingsError: null,
  };
}

function paths(days: number): PathsRes {
  const r = rng(days * 13);
  const rows: PathRow[] = [];
  const base = Date.now() - days * DAY;
  for (let v = 0; v < 260; v++) {
    const person = `p${v % 190}`;
    const sid = `s${v}`;
    let t = base + r() * days * DAY;
    const push = (e: string, path: string | null) => {
      rows.push([e, person, sid, path, new Date(t).toISOString()]);
      t += (0.5 + r() * 3) * MIN;
    };
    const entry = r();
    const first = entry < 0.42 ? "/" : entry < 0.62 ? "/learn" : entry < 0.8 ? lessonPath(Math.floor(r() * LESSONS.length)) : entry < 0.92 ? `/stories/${STORIES[Math.floor(r() * 2)][0]}` : "/play";
    push("$pageview", first);
    if (r() < 0.35) continue;
    if (first !== "/learn") push("$pageview", r() < 0.6 ? "/learn" : "/stories");
    if (r() < 0.3) continue;
    const li = Math.floor(r() * LESSONS.length);
    push("$pageview", lessonPath(li));
    push("lesson_open", lessonPath(li));
    if (r() < 0.45) continue;
    push("stage_done", lessonPath(li));
    if (r() < 0.55) continue;
    push("lesson_complete", lessonPath(li));
    if (r() < 0.5) push("$pageview", "/learn/dashboard");
  }
  return { configured: true, ...computePaths(rows, titleOf, days) };
}

function page(path: string, days: number): PageDetailRes {
  const r = rng(path.length * 7 + days);
  const isLesson = path.startsWith("/learn/") && path.split("/").length === 5;
  const clicks = isLesson
    ? [
        ["Mark complete", "button"],
        ["Next stage →", "a"],
        ["Ask AI", "button"],
        ["Copy link to section", "button"],
        ["Show answer", "button"],
        ["Contents", "button"],
        ["Read aloud", "button"],
      ]
    : [
        ["Start the course", "a"],
        ["Case files", "a"],
        ["Sign in", "button"],
        ["Week 01 · Data at Scale", "a"],
        ["Arcade", "a"],
      ];
  const top = 40 + Math.floor(r() * 60);
  return {
    configured: true,
    path,
    title: titleOf(path),
    clicks: clicks.map(([text, tag], i) => ({ text, tag, n: Math.round(top / (i + 1.2)), rage: i === 0 && isLesson ? 4 : 0 })),
    depth: [25, 50, 75, 100].map((pct, i) => ({ pct, readers: Math.round(top * Math.pow(0.68, i)) })),
    heatmapUrl: "https://us.posthog.com/project/12345/heatmaps",
    toolbarUrl: "https://us.posthog.com/project/12345/toolbar",
    siteUrl: `https://www.himanshukukreja.in${path}`,
  };
}

const PLAYER_HTML = `<!doctype html><html><body style="margin:0;height:100vh;display:grid;grid-template-rows:1fr auto;background:#111;color:#ddd;font:13px ui-monospace,monospace">
<div style="display:grid;place-items:center;border-bottom:1px solid #333"><div style="text-align:center"><div style="font-size:42px;color:#ff6b2b">▶</div><div>PostHog replay player (preview stub)</div><div style="color:#777;margin-top:6px">real sessions stream here from /embedded/&lt;token&gt;</div></div></div>
<div style="display:flex;gap:12px;align-items:center;padding:10px 14px"><span style="color:#ff6b2b">0:42</span><div style="flex:1;height:4px;background:#333"><div style="width:34%;height:4px;background:#ff6b2b"></div></div><span>2:05</span></div></body></html>`;

function status(): PhStatus {
  const setup = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup") === "1";
  return {
    configured: !setup,
    capture: !setup,
    ga: !setup,
    region: "us",
    uiHost: "https://us.posthog.com",
    projectId: setup ? null : "12345",
    proxyPath: "/hkr",
    missing: setup ? ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST", "POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID", "NEXT_PUBLIC_GA_ID"] : [],
  };
}

export function resolveJourneysFixture(u: URL, init?: RequestInit): unknown {
  const st = status();
  if (u.pathname === "/api/admin/posthog/status") return st;
  if (!st.configured) return { configured: false, status: st } satisfies NotConfigured;
  const days = Number(u.searchParams.get("days")) || 30;
  switch (u.pathname) {
    case "/api/admin/posthog/live":
      return live();
    case "/api/admin/posthog/feed":
      return liveFeed(u);
    case "/api/admin/posthog/recordings/snapshots":
      return u.searchParams.has("from") ? undefined : replayFixtureSources(u.searchParams.get("id") || "");
    case "/api/admin/posthog/people": {
      const q = (u.searchParams.get("q") || "").toLowerCase();
      const kind = u.searchParams.get("kind");
      const people = PEOPLE.filter((p) => (!q || [p.email, p.name, p.city, p.country, p.distinctId].some((v) => v?.toLowerCase().includes(q))) && (kind === "identified" ? p.identified : kind === "anonymous" ? !p.identified : true));
      return { configured: true, people, days } satisfies PeopleRes;
    }
    case "/api/admin/posthog/person":
      return personRes(u.searchParams.get("id") || "", days);
    case "/api/admin/posthog/recordings": {
      const person = u.searchParams.get("person");
      const path = u.searchParams.get("path");
      const recordings = ALL_RECORDINGS.filter((r) => (!person || r.personId === person) && (!path || r.pages.includes(path)));
      return { configured: true, recordings, hasNext: false } satisfies RecordingsRes;
    }
    case "/api/admin/posthog/recordings/share": {
      const body = JSON.parse(String(init?.body || "{}")) as { id?: string; enabled?: boolean };
      return {
        configured: true,
        id: body.id || "",
        embedUrl: body.enabled === false ? null : `data:text/html;charset=utf-8,${encodeURIComponent(PLAYER_HTML)}`,
        appUrl: `https://us.posthog.com/project/12345/replay/${body.id}`,
        shared: body.enabled !== false,
      } satisfies EmbedRes;
    }
    case "/api/admin/posthog/paths":
      return paths(days);
    case "/api/admin/posthog/page":
      return page(u.searchParams.get("path") || "/", days);
    default:
      return undefined;
  }
}

/** Text endpoints: replay snapshot chunks (JSONL). */
export function resolveJourneysFixtureText(u: URL): string | undefined {
  if (u.pathname === "/api/admin/posthog/recordings/snapshots" && u.searchParams.has("from")) {
    return replayFixtureChunk(Number(u.searchParams.get("from")) || 0, Number(u.searchParams.get("to") ?? u.searchParams.get("from")) || 0);
  }
  return undefined;
}
