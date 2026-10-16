/**
 * Pure helpers for /admin/journeys: PostHog event rows → readable timeline items, autocapture
 * element parsing, and path / funnel maths over raw rows. No I/O (unit-testable, used by the
 * server routes and the dev fixtures alike).
 */
import type { PathsRes, TimelineKind } from "./journeys";

export type TitleOf = (path: string | null | undefined) => string | null;
export type Props = Record<string, string | number | boolean | null | undefined>;

/** Event properties pulled for every timeline row (HogQL `properties.<name>`). */
export const EVENT_PROPS = [
  "$session_id",
  "$pathname",
  "$el_text",
  "$event_type",
  "page_title",
  "title",
  "course",
  "week",
  "lesson",
  "stage",
  "story",
  "slug",
  "pct",
  "correct",
  "first",
  "q",
  "kind",
  "channel",
  "client",
  "score",
  "total",
  "passed",
  "game",
  "result",
  "provider",
  "minutes",
  "index",
  "q_len",
  "results",
  "checkpoint",
  "reviewed",
  "scope",
  "content_type",
  "chars",
  "part",
  "$exception_message",
  "$geoip_country_code",
  "$geoip_city_name",
  "$device_type",
  "$browser",
] as const;

export type EventProp = (typeof EVENT_PROPS)[number];

/** `properties.$x AS p_x` select list in EVENT_PROPS order. */
export const eventPropsSelect = () => EVENT_PROPS.map((p, i) => `properties.${p} AS p${i}`).join(", ");

export function propsFrom(row: unknown[], offset: number): Props {
  const out: Props = {};
  EVENT_PROPS.forEach((p, i) => {
    const v = row[offset + i];
    if (v != null && v !== "") out[p] = typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean);
  });
  return out;
}

/* ───────────────────────────── autocapture elements ───────────────────────────── */

/**
 * PostHog `elements_chain`: elements from the clicked one outwards, `;`-separated, e.g.
 * `button.btn:text="Start lesson"nth-child="2"attr__href="/learn";div.wrap:nth-child="1"`.
 */
export function parseElements(chain: string | null | undefined): { tag: string | null; text: string | null; href: string | null } {
  if (!chain) return { tag: null, text: null, href: null };
  const parts = chain.split(/;(?=[a-zA-Z0-9_-]+[.:])/);
  const first = parts[0] || "";
  const tag = (first.match(/^([a-zA-Z0-9_-]+)/) || [])[1] || null;
  let text: string | null = null;
  for (const p of parts.slice(0, 4)) {
    const m = p.match(/(?:^|[":])text="((?:[^"\\]|\\.)*)"/);
    if (m && m[1].trim()) {
      text = m[1].replace(/\\"/g, '"').trim();
      break;
    }
  }
  let href: string | null = null;
  for (const p of parts.slice(0, 4)) {
    const m = p.match(/(?:attr__href|href)="((?:[^"\\]|\\.)*)"/);
    if (m) {
      href = m[1];
      break;
    }
  }
  return { tag, text, href };
}

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ───────────────────────────── describe ───────────────────────────── */

const s = (v: unknown) => (v == null ? "" : String(v));

function lessonName(p: Props, titleOf: TitleOf): string {
  if (p.course && p.week && p.lesson) return titleOf(`/learn/${p.course}/${p.week}/${p.lesson}`) || s(p.lesson);
  return s(p.lesson || p.slug || "a lesson");
}
function storyName(p: Props, titleOf: TitleOf): string {
  const slug = s(p.story || p.slug);
  return (slug && titleOf(`/stories/${slug}`)) || slug || "a case file";
}

/** Human label + category for one event. */
export function describe(event: string, p: Props, chain: string | null, titleOf: TitleOf): { kind: TimelineKind; label: string; detail: string | null } {
  const path = (p.$pathname as string) || null;
  const pageTitle = titleOf(path) || (p.page_title as string) || (p.title as string) || null;
  const el = () => {
    const parsed = parseElements(chain);
    const text = (p.$el_text as string) || parsed.text;
    return { text: text ? clip(text.replace(/\s+/g, " ")) : null, tag: parsed.tag, href: parsed.href };
  };
  switch (event) {
    case "$pageview":
      return { kind: "pageview", label: `Viewed ${pageTitle ? `“${clip(pageTitle, 80)}”` : path || "a page"}`, detail: pageTitle ? path : null };
    case "$autocapture": {
      const e = el();
      const type = p.$event_type as string | undefined;
      if (type === "submit") return { kind: "form", label: "Submitted a form", detail: path };
      if (type === "change") return { kind: "form", label: `Changed ${e.tag === "select" ? "a dropdown" : "an input"}`, detail: path };
      const what = e.text ? `“${e.text}”` : e.tag ? `a ${e.tag}` : "something";
      return { kind: "click", label: `Clicked ${what}`, detail: [e.href && e.href !== path ? `→ ${clip(e.href, 70)}` : null, path].filter(Boolean).join(" · ") || null };
    }
    case "$rageclick": {
      const e = el();
      return { kind: "rage", label: `Rage-clicked ${e.text ? `“${e.text}”` : e.tag || "an element"}`, detail: path };
    }
    case "$dead_click": {
      const e = el();
      return { kind: "rage", label: `Dead click on ${e.text ? `“${e.text}”` : e.tag || "an element"}`, detail: path };
    }
    case "read_progress": {
      const name = p.content_type === "story" || p.story ? storyName(p, titleOf) : lessonName(p, titleOf);
      return { kind: "read", label: `Read ${s(p.pct)}% of “${clip(name, 70)}”`, detail: p.minutes ? null : path };
    }
    case "lesson_open":
      return { kind: "lesson", label: `Opened lesson “${clip(lessonName(p, titleOf), 70)}”`, detail: p.stage ? `at stage ${p.stage}` : null };
    case "stage_reach":
      return { kind: "lesson", label: `Reached stage ${s(p.stage)}`, detail: `${clip(lessonName(p, titleOf), 60)}${p.total ? ` · ${num(p.index) + 1}/${s(p.total)}` : ""}` };
    case "stage_done":
      return { kind: "lesson", label: `Finished stage ${s(p.stage)}`, detail: `${clip(lessonName(p, titleOf), 60)}${p.total ? ` · ${num(p.index) + 1}/${s(p.total)}` : ""}` };
    case "lesson_complete":
      return { kind: "lesson", label: `Completed “${clip(lessonName(p, titleOf), 70)}”`, detail: p.minutes != null ? `${s(p.minutes)} min engaged` : null };
    case "quiz_answer":
      return { kind: "quiz", label: `Answered quiz Q${s(p.q) || "?"} · ${p.correct === true || p.correct === "true" ? "correct" : "wrong"}${p.first === true || p.first === "true" ? " (first try)" : ""}`, detail: clip(lessonName(p, titleOf), 70) };
    case "trial_result":
      return { kind: "quiz", label: `Trial ${s(p.week)} part ${s(p.part ?? p.index)}: ${s(p.score)}/${s(p.total)}${p.passed === true || p.passed === "true" ? " · passed" : ""}`, detail: null };
    case "review_session":
      return { kind: "quiz", label: `Review session: ${s(p.correct)}/${s(p.reviewed)} remembered`, detail: null };
    case "ask_ai":
      return { kind: "ai", label: `Asked AI${p.client ? ` (${p.client})` : ""}`, detail: [p.kind, p.chars ? `${p.chars} chars` : null, path].filter(Boolean).join(" · ") || null };
    case "share_link":
      return { kind: "share", label: `Shared a ${s(p.kind) || "link"} (${s(p.channel) || "share"})`, detail: path };
    case "search":
      return { kind: "search", label: `Searched (${s(p.q_len)} chars, ${s(p.results)} results)`, detail: path };
    case "play":
    case "contrib_snake":
    case "daily_result":
      return { kind: "play", label: event === "contrib_snake" ? `Played contribution snake · ${s(p.score)}` : `Played ${s(p.game) || "a game"}${p.result ? ` · ${p.result}` : ""}${p.score != null ? ` · ${p.score}` : ""}`, detail: path };
    case "case_activity":
      return { kind: "play", label: `Case activity “${s(p.kind)}” · ${s(p.score)}/${s(p.total ?? "")}`.replace(/\/$/, ""), detail: storyName(p, titleOf) };
    case "case_checkpoint":
      return { kind: "read", label: `Case checkpoint ${num(p.index) + 1}/${s(p.total)}`, detail: storyName(p, titleOf) };
    case "case_closed":
      return { kind: "lesson", label: `Closed case “${clip(storyName(p, titleOf), 70)}”`, detail: p.minutes != null ? `${s(p.minutes)} min` : null };
    case "signed_in":
    case "signed_up":
    case "$identify":
      return { kind: "signin", label: event === "signed_up" ? "Signed up" : event === "$identify" ? "Identified (signed in)" : "Signed in", detail: p.provider ? `via ${p.provider}` : null };
    case "$exception":
      return { kind: "error", label: "Hit a JS error", detail: p.$exception_message ? clip(String(p.$exception_message), 90) : path };
    case "reset":
      return { kind: "event", label: `Reset progress (${s(p.scope)})`, detail: null };
    default:
      return { kind: "event", label: event.replace(/^\$/, "").replace(/_/g, " "), detail: path };
  }
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ───────────────────────────── paths & funnel ───────────────────────────── */

/** Raw rows for paths: [event, person, session, path, iso time]. */
export type PathRow = [string, string, string | null, string | null, string];

export const FUNNEL_STEPS = [
  { key: "land", label: "Landed" },
  { key: "learn", label: "Visited /learn" },
  { key: "lesson_open", label: "Opened a lesson" },
  { key: "stage_done", label: "Finished a stage" },
  { key: "lesson_complete", label: "Completed a lesson" },
] as const;

export function computePaths(rows: PathRow[], titleOf: TitleOf, days: number): Omit<PathsRes, "configured"> {
  const sorted = [...rows].sort((a, b) => (a[4] < b[4] ? -1 : a[4] > b[4] ? 1 : 0));
  const sessions = new Map<string, string[]>();
  const pageViews = new Map<string, { views: number; visitors: Set<string> }>();
  const people = new Map<string, number>(); // furthest funnel step per person (in order)

  for (const [event, person, session, path] of sorted) {
    if (event === "$pageview" && path) {
      const sid = session || `p:${person}`;
      const seq = sessions.get(sid) || [];
      if (seq[seq.length - 1] !== path) seq.push(path);
      sessions.set(sid, seq);
      const pv = pageViews.get(path) || { views: 0, visitors: new Set<string>() };
      pv.views++;
      pv.visitors.add(person);
      pageViews.set(path, pv);
    }
    // ordered funnel: a step counts only after the previous one
    const at = people.get(person) ?? -1;
    const next = at + 1;
    const step = FUNNEL_STEPS[next]?.key;
    if (!step) continue;
    const hit =
      step === "land"
        ? event === "$pageview"
        : step === "learn"
          ? event === "$pageview" && !!path && (path === "/learn" || path.startsWith("/learn/"))
          : event === step;
    if (hit) people.set(person, next);
  }

  const count = <K,>(xs: K[]) => {
    const m = new Map<K, number>();
    for (const x of xs) m.set(x, (m.get(x) || 0) + 1);
    return m;
  };
  const seqs = [...sessions.values()].filter((q) => q.length > 0);
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([path, n]) => ({ path, title: titleOf(path), n }));

  const pathCounts = count(seqs.filter((q) => q.length > 1).map((q) => q.slice(0, 4).join("\u0000")));
  const funnel = FUNNEL_STEPS.map((st, i) => ({ key: st.key, label: st.label, n: [...people.values()].filter((v) => v >= i).length }));

  return {
    days,
    sessions: seqs.length,
    entries: top(count(seqs.map((q) => q[0])), 12),
    exits: top(count(seqs.map((q) => q[q.length - 1])), 8),
    paths: [...pathCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, n]) => ({ steps: k.split("\u0000"), n })),
    funnel,
    pages: [...pageViews.entries()]
      .map(([path, v]) => ({ path, title: titleOf(path), views: v.views, visitors: v.visitors.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 30),
  };
}
