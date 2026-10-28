/**
 * The distribution pack (/admin/distribution): the copy for posting a short to YouTube Shorts and Instagram
 * Reels, written from the short's own data (title, summary, first line, label, category, topics, its article),
 * and the suggested posting order. Pure and deterministic (no AI, no I/O): the admin page runs it in the
 * browser, so marking a post updates the order at once.
 */
import { SITE_URL } from "@/lib/site";
import { SHORT_CATEGORIES, type ShortCategory } from "./types";

export const COURSE_NAME = "System Design Mastery";
export const PLATFORMS = [
  { id: "youtube", label: "YouTube Shorts", short: "YouTube" },
  { id: "instagram", label: "Instagram Reels", short: "Instagram" },
] as const;
export type Platform = (typeof PLATFORMS)[number]["id"];
export const isPlatform = (p: unknown): p is Platform => p === "youtube" || p === "instagram";

export type PostStatus = "none" | "scheduled" | "posted";
export type Post = { status: "scheduled" | "posted"; scheduledAt: string | null; postedAt: string | null; url: string | null };

/** One live short as the distribution page gets it from /api/admin/distribution. */
export type DistShort = {
  id: string;
  title: string;
  label: string;
  category: ShortCategory;
  topics: string[];
  lecture: string;
  /** the written article (site path) */
  article: string;
  /** the full lecture at this idea (site path), or null */
  full: string | null;
  poster: string;
  /** the MP4 on the media host */
  video: string;
  /** seconds (the recorded media's length, else the estimate) */
  duration: number;
  summary: string;
  /** the first narrated line */
  hook: string;
  /** shortScore over the stats window (higher = better) */
  score: number;
  viewers: number;
  posts: Partial<Record<Platform, Post>>;
};

export const categoryLabel = (c: string) => SHORT_CATEGORIES.find((x) => x.id === c)?.label ?? c;
export const postStatus = (s: DistShort, p: Platform): PostStatus => s.posts[p]?.status ?? "none";

/* ─────────────────────────────── copy ─────────────────────────────── */

const clean = (t: string) => t.replace(/\s+/g, " ").trim();

/** Cut at a word boundary to at most `max` characters (no ellipsis: platforms show their own). */
export function clip(t: string, max: number): string {
  const s = clean(t);
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1).replace(/\s+\S*$/, "");
  return (cut || s.slice(0, max)).replace(/[\s,;:–—-]+$/, "");
}

/** The first `n` sentences of a text, at most `max` characters. */
export function sentences(t: string, n: number, max: number): string {
  const parts = clean(t).split(/(?<=[.!?])\s+(?=[A-Z0-9"'“‘(])/);
  let out = "";
  for (const p of parts.slice(0, n)) {
    const next = out ? `${out} ${p}` : p;
    if (next.length > max) break;
    out = next;
  }
  return out || clip(t, max);
}

const CATEGORY_TAG: Record<ShortCategory, string> = {
  course: "softwareengineering",
  quests: "howitworks",
  stories: "postmortem",
  problems: "systemdesigninterview",
  lld: "lowleveldesign",
  cases: "casestudy",
  mocks: "mockinterview",
};
const tag = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** 3 to 5 hashtags from the short's topics and category; YouTube's last one is #shorts. */
export function hashtags(s: Pick<DistShort, "topics" | "category">, platform: Platform): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    const k = tag(t);
    if (k && !out.includes(k)) out.push(k);
  };
  add("systemdesign");
  for (const t of s.topics.slice(0, platform === "youtube" ? 2 : 3)) add(t);
  add(CATEGORY_TAG[s.category] ?? "softwareengineering");
  if (out.length < 4) add("softwareengineering");
  const tags = out.slice(0, platform === "youtube" ? 4 : 5);
  if (platform === "youtube") tags.push("shorts");
  return tags.map((t) => `#${t}`);
}

/** The full lesson on the site with the campaign tags (the article; else the lecture; else the short's page). */
export function lessonUrl(s: Pick<DistShort, "id" | "article" | "full">, platform: Platform): string {
  const path = s.article || s.full || `/learn/shorts/${s.id}`;
  const u = new URL(path, SITE_URL);
  u.searchParams.set("utm_source", platform);
  u.searchParams.set("utm_medium", platform === "youtube" ? "shorts" : "reels");
  u.searchParams.set("utm_campaign", s.id);
  return u.toString();
}

/** YouTube title: the short's own title (already its hook), at most 100 characters. */
export const youtubeTitle = (s: Pick<DistShort, "title">) => clip(s.title, 100);

/** YouTube description: a one or two line summary, the lesson link, the course, then the hashtags. */
export function youtubeDescription(s: DistShort): string {
  return [sentences(s.summary, 2, 280), "", `Full lesson: ${lessonUrl(s, "youtube")}`, `${COURSE_NAME} · ${s.label}`, "", hashtags(s, "youtube").join(" ")].join("\n");
}

/** Instagram caption: the hook line first, the summary, a link-in-bio line (Reels captions don't link), hashtags last. */
export function instagramCaption(s: DistShort): string {
  const tags = hashtags(s, "instagram").join(" ");
  const tail = ["", `${COURSE_NAME} · ${s.label}`, "Full lesson: link in bio.", "", tags].join("\n");
  const hook = clip(s.hook || s.title, 300);
  const room = 2200 - tail.length - hook.length - 2;
  const body = clean(s.summary) && clean(s.summary) !== hook ? clip(s.summary, Math.max(0, room)) : "";
  return [hook, ...(body ? ["", body] : []), tail].join("\n");
}

/* ─────────────────────────── posting order ─────────────────────────── */

/** Suggested slot for one short on one platform: its place in the queue and the day (IST) to post it. */
export type Slot = { n: number; date: string; time: string };

const IST_MS = 5.5 * 3_600_000;
/** YYYY-MM-DD in IST. */
export const istDay = (t: number | string | Date) => new Date(new Date(t).getTime() + IST_MS).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Suggested posting times (IST) for the slots of a day. */
export const SLOT_TIMES = ["09:00", "19:00", "13:00", "16:00"];

/** Stable tie-break for shorts with the same score, so equal shorts don't queue in id (lecture) order. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The queue for one platform: every short not yet posted or scheduled there, best first by score, never two
 * from the same lecture in a row and, when it can, never two of the same category in a row. `perDay` posts a
 * day from tomorrow (IST), around the posts already scheduled on that platform.
 */
export function suggestOrder(shorts: DistShort[], platform: Platform, opts: { perDay?: number; now?: number } = {}): Map<string, Slot> {
  const perDay = Math.max(1, Math.min(SLOT_TIMES.length, opts.perDay ?? 2));
  const now = opts.now ?? Date.now();
  const queue = shorts
    .filter((s) => postStatus(s, platform) === "none")
    .sort((a, b) => b.score - a.score || b.viewers - a.viewers || hash(a.id) - hash(b.id));

  // what went out (or goes out) last on this platform: the queue's first pick shouldn't repeat it
  const placed = shorts
    .map((s) => ({ s, at: s.posts[platform]?.scheduledAt || s.posts[platform]?.postedAt || null }))
    .filter((x): x is { s: DistShort; at: string } => !!x.at)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  let prev: DistShort | null = placed[0]?.s ?? null;

  // slots already taken by scheduled posts, per IST day
  const taken = new Map<string, number>();
  for (const s of shorts) {
    const p = s.posts[platform];
    if (p?.status === "scheduled" && p.scheduledAt && Date.parse(p.scheduledAt) > now) taken.set(istDay(p.scheduledAt), (taken.get(istDay(p.scheduledAt)) || 0) + 1);
  }

  const out = new Map<string, Slot>();
  let day = addDays(istDay(now), 1);
  let used = taken.get(day) || 0;
  const left = [...queue];
  for (let n = 1; left.length; n++) {
    const p: DistShort | null = prev;
    let i: number = p ? left.findIndex((s) => s.lecture !== p.lecture && s.category !== p.category) : 0;
    if (i < 0) i = left.findIndex((s) => s.lecture !== p!.lecture);
    if (i < 0) i = 0;
    const s: DistShort = left.splice(i, 1)[0];
    while (used >= perDay) {
      day = addDays(day, 1);
      used = taken.get(day) || 0;
    }
    out.set(s.id, { n, date: day, time: SLOT_TIMES[used] });
    used++;
    prev = s;
  }
  return out;
}

/* ─────────────────────────────── CSV ─────────────────────────────── */

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The metadata and copy for a set of shorts, one row each; `slots` adds the suggested order per platform. */
export function distributionCsv(rows: DistShort[], slots: Record<Platform, Map<string, Slot>>): string {
  const head = [
    "id",
    "title",
    "category",
    "label",
    "topics",
    "seconds",
    "score",
    "viewers",
    "watch_page",
    "mp4",
    "poster",
    "youtube_status",
    "youtube_suggested_n",
    "youtube_suggested_date",
    "youtube_scheduled_at",
    "youtube_posted_at",
    "youtube_url",
    "youtube_title",
    "youtube_description",
    "instagram_status",
    "instagram_suggested_n",
    "instagram_suggested_date",
    "instagram_scheduled_at",
    "instagram_posted_at",
    "instagram_url",
    "instagram_caption",
  ];
  const lines = rows.map((s) => {
    const per = (p: Platform) => {
      const post = s.posts[p];
      const slot = slots[p].get(s.id);
      return [postStatus(s, p), slot?.n ?? "", slot ? `${slot.date} ${slot.time} IST` : "", post?.scheduledAt ?? "", post?.postedAt ?? "", post?.url ?? ""];
    };
    return [
      s.id,
      s.title,
      categoryLabel(s.category),
      s.label,
      s.topics.join(" "),
      Math.round(s.duration),
      s.score.toFixed(3),
      s.viewers,
      `${SITE_URL}/learn/shorts/${s.id}`,
      s.video,
      s.poster,
      ...per("youtube"),
      youtubeTitle(s),
      youtubeDescription(s),
      ...per("instagram"),
      instagramCaption(s),
    ]
      .map(cell)
      .join(",");
  });
  return [head.join(","), ...lines].join("\r\n");
}
